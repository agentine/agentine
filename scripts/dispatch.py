#!/usr/bin/env python3
"""Agentine dispatcher — owns agent lifecycle, presence, and scheduling."""

import concurrent.futures
import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import requests

# Load .env if present
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            # Handle: export KEY='value' or KEY=value
            line = line.removeprefix("export").strip()
            if "=" in line:
                key, _, value = line.partition("=")
                value = value.strip("'\"")
                os.environ.setdefault(key.strip(), value)

API = os.environ.get("API_URL", "https://agentine.mtingers.com")
API_KEY = os.environ["API_KEY"]
HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

# Roles that generate work and should always run (no task check)
GENERATORS = {"ARCHITECT",} #  "COMMUNITY_MANAGER"}

# Retry strategies by exit code
RETRY_STRATEGIES = {
    0: None,  # success
    2: None,  # bad input — don't retry
}

# Default retry: general error
DEFAULT_RETRY = {"delays": [60, 300, 600], "max_attempts": 3}

# OOM/crash retry
OOM_RETRY = {"delays": [300, 600], "max_attempts": 2}


@dataclass
class AgentConfig:
    role: str
    backend: str
    model: str
    effort: str


def load_config(path: str = "agents.conf") -> list[AgentConfig]:
    agents = []
    conf = Path(path)
    if not conf.exists():
        print(f"error: {path} not found")
        sys.exit(1)
    for line in conf.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("|")
        if len(parts) != 4:
            print(f"warning: skipping malformed line: {line}")
            continue
        role, backend, model, effort = parts
        agents.append(AgentConfig(role.strip(), backend.strip(), model.strip(), effort.strip()))
    return agents


def api(method: str, path: str, **kwargs) -> requests.Response | None:
    try:
        return requests.request(
            method, f"{API}{path}", headers=HEADERS, timeout=30, **kwargs
        )
    except requests.RequestException as e:
        print(f"  api error: {method} {path} — {e}")
        return None


def journal(content: str, project: str | None = None):
    """Write a dispatcher journal entry."""
    payload: dict = {"username": "dispatcher", "content": content}
    if project:
        payload["project"] = project
    api("POST", "/journal", json=payload)


def set_presence(username: str, status: str, project: str | None = None):
    payload: dict = {"username": username, "status": status}
    if project:
        payload["project"] = project
    api("POST", "/agents", json=payload)


def clear_all_presence():
    """Reset all agents to idle on startup."""
    resp = api("GET", "/agents?status=running")
    if resp and resp.ok:
        stuck = [a["username"] for a in resp.json().get("items", [])]
        if stuck:
            for username in stuck:
                print(f"  cleanup: {username} was stuck as 'running', setting idle")
                set_presence(username, "idle")
            journal(f"startup cleanup: reset {len(stuck)} stuck agent(s) to idle: {', '.join(stuck)}")


def has_work(username: str) -> bool:
    for status in ("pending", "in_progress"):
        resp = api("GET", f"/tasks?username={username}&status={status}&limit=1")
        if resp and resp.ok and resp.json().get("total", 0) > 0:
            return True
    return False


def get_pending_projects(username: str) -> list[str]:
    """Return unique projects with pending/in_progress tasks for this agent."""
    found: set[str] = set()
    for status in ("pending", "in_progress"):
        resp = api("GET", f"/tasks?username={username}&status={status}&limit=100")
        if resp and resp.ok:
            for task in resp.json().get("items", []):
                proj = task.get("project")
                if proj:
                    found.add(proj)
    return sorted(found)


def project_locked(project: str) -> bool:
    """Check if any agent is already running on this project."""
    resp = api("GET", "/agents?status=running")
    if resp and resp.ok:
        for agent in resp.json().get("items", []):
            if agent.get("project") == project:
                return True
    return False


def check_stale_blocked_tasks():
    """Log warnings for tasks blocked longer than 3 hours."""
    resp = api("GET", "/tasks?status=blocked&older_than=3h&limit=100")
    if resp and resp.ok:
        total = resp.json().get("total", 0)
        if total > 0:
            print(f"  WARNING: {total} task(s) blocked >3h")
            lines = []
            for task in resp.json().get("items", []):
                lines.append(f"- [{task['id']}] {task['title']} (assigned: {task['username']})")
                print(f"    {lines[-1]}")
            journal(f"STALE BLOCKED: {total} task(s) blocked >3h:\n" + "\n".join(lines))


def validate_summary(role: str, project: str | None = None):
    """Check if the summary file has a YAML frontmatter header."""
    if project:
        path = Path(f"cache/{role}.{project}.summary")
    else:
        path = Path(f"cache/{role}.summary")

    if not path.exists():
        return

    content = path.read_text()
    if not content.startswith("---"):
        print(f"  warning: {path} missing YAML frontmatter header")


def log_run(
    agent: str,
    backend: str,
    model: str,
    project: str | None,
    started_at: str,
    finished_at: str,
    exit_code: int,
    duration_seconds: int,
):
    """Log a run to the agent-comms API."""
    payload: dict = {
        "agent": agent,
        "backend": backend,
        "model": model,
        "started_at": started_at,
        "finished_at": finished_at,
        "exit_code": exit_code,
        "duration_seconds": duration_seconds,
    }
    if project:
        payload["project"] = project
    api("POST", "/runs", json=payload)


def get_retry_strategy(exit_code: int) -> dict | None:
    """Get retry strategy for a given exit code."""
    if exit_code in RETRY_STRATEGIES:
        return RETRY_STRATEGIES[exit_code]
    if exit_code in (137, 139):
        return OOM_RETRY
    return DEFAULT_RETRY


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_agent(config: AgentConfig, project: str | None = None) -> int:
    """Invoke an agent with retry logic, managing its presence lifecycle."""
    label = f"{config.role}" + (f"/{project}" if project else "")
    username = config.role.lower()

    strategy = DEFAULT_RETRY
    attempt = 0

    while True:
        attempt += 1

        # --- Dispatcher owns presence ---
        set_presence(username, "running", project)

        cmd = [
            "scripts/run_agent.sh",
            config.role,
            config.backend,
            config.model,
            config.effort,
        ]
        if project:
            cmd.append(project)

        started_at = utcnow()
        start_time = time.monotonic()
        print(f"  START: {label} (attempt {attempt})")

        try:
            result = subprocess.run(cmd)
            exit_code = result.returncode
        except Exception as e:
            print(f"  ERROR: {label} — {e}")
            exit_code = 1
        finally:
            # --- Always clean up presence ---
            set_presence(username, "idle")

        finished_at = utcnow()
        duration = int(time.monotonic() - start_time)

        # Log run to API
        log_run(
            agent=config.role.lower(),
            backend=config.backend,
            model=config.model,
            project=project,
            started_at=started_at,
            finished_at=finished_at,
            exit_code=exit_code,
            duration_seconds=duration,
        )

        if exit_code == 0:
            print(f"  DONE: {label} ({duration}s)")
            journal(f"completed {label} in {duration}s", project)
            # Validate summary format
            validate_summary(config.role, project)
            # Commit cache summary
            subprocess.run(["git", "add"] + list(Path("cache").glob("*summary")), capture_output=True)
            subprocess.run(
                ["git", "commit", "-m", f"run_agent: commit {config.role} summary cache"],
                capture_output=True,
            )
            return 0

        # Determine retry strategy
        strategy = get_retry_strategy(exit_code)

        if strategy is None:
            if exit_code == 2:
                msg = f"skipped {label} — bad input/config (exit 2), not retrying"
                print(f"  SKIP: {label} — bad input/config (exit 2), not retrying")
            else:
                msg = f"finished {label} (exit {exit_code})"
                print(f"  DONE: {label} (exit {exit_code})")
            journal(msg, project)
            return exit_code

        if attempt >= strategy["max_attempts"]:
            print(f"  GIVE UP: {label} — failed {attempt} attempts (last exit {exit_code})")
            journal(f"gave up on {label} after {attempt} attempts (exit {exit_code})", project)
            return exit_code

        delay = strategy["delays"][min(attempt - 1, len(strategy["delays"]) - 1)]
        print(f"  RETRY: {label} — exit {exit_code}, waiting {delay}s (attempt {attempt}/{strategy['max_attempts']})")
        time.sleep(delay)


def dispatch_cycle(agents: list[AgentConfig], allow_architect: bool):
    """Run one dispatch cycle."""

    # Check for stale blocked tasks
    check_stale_blocked_tasks()

    # Phase 1: Run generators sequentially (they create work for others)
    for config in agents:
        if config.role not in GENERATORS:
            continue
        if config.role == "ARCHITECT" and not allow_architect:
            print(f"  SKIP: {config.role} (disabled)")
            continue
        run_agent(config)

    # Phase 2: Collect work for task-driven agents
    work_queue: list[tuple[AgentConfig, str | None]] = []

    for config in agents:
        if config.role in GENERATORS:
            continue

        username = config.role.lower()
        if not has_work(username):
            print(f"  SKIP: {config.role} (no pending tasks)")
            continue

        projects = get_pending_projects(username)
        if projects:
            for proj in projects:
                work_queue.append((config, proj))
        else:
            # Tasks exist but no project field — run unscoped
            work_queue.append((config, None))

    if not work_queue:
        print("  no work queued for task-driven agents")
        return

    # Phase 3: Execute work queue in parallel (respecting project locks)
    print(f"  dispatching {len(work_queue)} agent/project pair(s)...")

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures: dict[concurrent.futures.Future, str] = {}

        for config, proj in work_queue:
            label = f"{config.role}" + (f"/{proj}" if proj else "")

            if proj and project_locked(proj):
                print(f"  SKIP: {label} (project locked)")
                journal(f"skipped {label} — project locked by another agent", proj)
                continue

            future = executor.submit(run_agent, config, proj)
            futures[future] = label

        for future in concurrent.futures.as_completed(futures):
            label = futures[future]
            try:
                future.result()
            except Exception as e:
                print(f"  EXCEPTION: {label} — {e}")


def main():
    allow_architect = len(sys.argv) > 1 and sys.argv[1] == "yes"
    agents = load_config()

    print(f"agentine dispatcher starting (architect={'enabled' if allow_architect else 'disabled'})")
    print(f"  api: {API}")
    print(f"  agents: {', '.join(a.role for a in agents)}")

    # Clean up stale presence from previous crashed run
    print("startup: clearing stale agent presence...")
    clear_all_presence()

    # Clean up on exit
    def handle_signal(sig, _frame):
        signame = signal.Signals(sig).name
        print(f"\n{signame} received — clearing agent presence...")
        clear_all_presence()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    iteration = 0
    while True:
        print(f"\n{'='*40}")
        print(f"iteration {iteration}")
        print(f"{'='*40}")

        dispatch_cycle(agents, allow_architect)

        if iteration > 0 and iteration % 4 == 0:
            print("long break: 30 minutes...")
            time.sleep(1800)
        else:
            print("short break: 5 minutes...")
            time.sleep(300)

        iteration += 1


if __name__ == "__main__":
    main()
