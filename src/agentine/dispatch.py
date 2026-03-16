#!/usr/bin/env python3
"""Agentine dispatcher — owns agent lifecycle, presence, and scheduling."""

import concurrent.futures
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from agentine.config import AgentConfig, DispatchConfig, api, load_config, API_URL

# Roles that generate work and should always run (no task check)
GENERATORS = {
    "ARCHITECT",
}  #  "COMMUNITY_MANAGER"}

# Retry strategies by exit code (None = don't retry)
NO_RETRY_CODES = {0, 2}

# Module-level dispatch config, set in main()
_dispatch: DispatchConfig = DispatchConfig()


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
            journal(
                f"startup cleanup: reset {len(stuck)} stuck agent(s) to idle: {', '.join(stuck)}"
            )


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
                lines.append(
                    f"- [{task['id']}] {task['title']} (assigned: {task['username']})"
                )
                print(f"    {lines[-1]}")
            journal(f"STALE BLOCKED: {total} task(s) blocked >3h:\n" + "\n".join(lines))


def check_stale_development_projects():
    """Transition development projects with no active tasks to testing.

    Projects can get stuck in 'development' status after all their tasks
    complete, which blocks the architect's concurrency check. Detect these
    and advance them to 'testing' so the pipeline keeps moving.
    """
    resp = api("GET", "/projects?status=development&limit=100")
    if not resp or not resp.ok:
        return

    projects = resp.json().get("items", [])
    if not projects:
        return

    for proj in projects:
        name = proj["name"]

        # Check for any active (pending/in_progress) tasks on this project
        has_active = False
        for status in ("pending", "in_progress"):
            task_resp = api("GET", f"/tasks?project={name}&status={status}&limit=1")
            if task_resp and task_resp.ok and task_resp.json().get("total", 0) > 0:
                has_active = True
                break

        if has_active:
            continue

        # Verify at least one done task exists (confirms work actually happened,
        # avoids advancing a project that just entered development)
        done_resp = api("GET", f"/tasks?project={name}&status=done&limit=1")
        if not done_resp or not done_resp.ok or done_resp.json().get("total", 0) == 0:
            continue

        # No active tasks but completed work exists — advance to testing
        patch_resp = api("PATCH", f"/projects/{name}", json={"status": "testing"})
        if patch_resp and patch_resp.ok:
            print(f"  ADVANCE: {name} development → testing (no active tasks)")
            journal(
                "auto-advanced project from development to testing — "
                "no pending/in_progress tasks remain",
                name,
            )
        else:
            print(f"  WARNING: failed to advance {name} to testing")


def check_stale_pipeline_projects():
    """Advance projects stuck in testing/documentation and ensure release tasks exist.

    - testing → documentation: when all tasks are done
    - documentation (all tasks done): create release_manager task if missing
      (release_manager sets status to 'published' when done)
    """

    def _project_is_idle(name: str) -> bool:
        """True if project has no active tasks but at least one done task."""
        for status in ("pending", "in_progress"):
            task_resp = api(
                "GET", f"/tasks?project={name}&status={status}&limit=1"
            )
            if (
                task_resp
                and task_resp.ok
                and task_resp.json().get("total", 0) > 0
            ):
                return False
        done_resp = api("GET", f"/tasks?project={name}&status=done&limit=1")
        return (
            done_resp is not None
            and done_resp.ok
            and done_resp.json().get("total", 0) > 0
        )

    # Phase 1: Advance testing → documentation
    resp = api("GET", "/projects?status=testing&limit=100")
    if resp and resp.ok:
        for proj in resp.json().get("items", []):
            name = proj["name"]
            if not _project_is_idle(name):
                continue
            patch_resp = api(
                "PATCH", f"/projects/{name}", json={"status": "documentation"}
            )
            if patch_resp and patch_resp.ok:
                print(f"  ADVANCE: {name} testing → documentation (no active tasks)")
                journal(
                    "auto-advanced project from testing to documentation — "
                    "no pending/in_progress tasks remain",
                    name,
                )
            else:
                print(f"  WARNING: failed to advance {name} to documentation")

    # Phase 2: Documentation done → ensure release_manager task exists
    resp = api("GET", "/projects?status=documentation&limit=100")
    if resp and resp.ok:
        for proj in resp.json().get("items", []):
            name = proj["name"]
            if not _project_is_idle(name):
                continue

            # Check if a release_manager task already exists for this project
            rm_resp = api(
                "GET",
                f"/tasks?project={name}&username=release_manager&limit=1",
            )
            has_rm_task = (
                rm_resp
                and rm_resp.ok
                and rm_resp.json().get("total", 0) > 0
            )
            if has_rm_task:
                continue

            task_payload = {
                "title": f"Release {name} v0.1.0",
                "description": (
                    f"Documentation complete for {name}. "
                    "Perform initial release: bump version, tag, "
                    "push, and create GitHub release to trigger "
                    "CI publish."
                ),
                "username": "release_manager",
                "project": name,
                "status": "pending",
            }
            create_resp = api("POST", "/tasks", json=task_payload)
            if create_resp and create_resp.ok:
                task_id = create_resp.json().get("id", "?")
                print(f"  TASK: created release task #{task_id} for {name}")
                journal(
                    f"auto-created release task #{task_id} for release_manager",
                    name,
                )
            else:
                print(f"  WARNING: failed to create release task for {name}")


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
    if exit_code in NO_RETRY_CODES:
        return None
    if exit_code in (137, 139):
        return {"delays": _dispatch.oom_delays, "max_attempts": _dispatch.oom_max_attempts}
    return {"delays": _dispatch.retry_delays, "max_attempts": _dispatch.retry_max_attempts}


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_agent_command(config: AgentConfig, project: str | None) -> list[str]:
    """Build the CLI command to invoke an agent."""
    role = config.role

    # Determine summary file path (prefer project-specific if it exists)
    summary_file = f"cache/{role}.summary"
    if project:
        project_summary = f"cache/{role}.{project}.summary"
        if Path(project_summary).exists():
            summary_file = project_summary

    project_clause = ""
    if project:
        project_clause = (
            f"Focus exclusively on project: {project}. "
            f"Only work on tasks where project={project}."
        )

    if config.backend == "claude":
        prompt = (
            f"0. Read @org-roles/{role}.md .\n"
            f"  1. Read previous context summary at @{summary_file} (if exists).\n"
            f"  2. {project_clause}\n"
            f"  3. Do your job. Note: your presence (running/idle) is managed by "
            f"the dispatcher — do not manage your own agent presence.\n"
            f"  4. Finally, save a new short and concise context summary to "
            f"{summary_file} for next run. Use the format in @SUMMARY_FORMAT.md ."
        )
        return [
            "claude",
            "-p",
            prompt,
            "--dangerously-skip-permissions",
            "--output-format",
            "stream-json",
            "--verbose",
            "--include-partial-messages",
            "--model",
            config.model,
            "--effort",
            config.effort,
        ]

    elif config.backend == "codex":
        role_content = Path(f"org-roles/{role}.md").read_text()
        try:
            summary = Path(summary_file).read_text()
        except FileNotFoundError:
            summary = "(no prior context)"

        prompt = (
            f"You are: {role}\n\n"
            f"{role_content}\n\n"
            f"Previous context summary:\n{summary}\n\n"
            f"{project_clause}\n\n"
            f"Do your job. Your presence (running/idle) is managed by the "
            f"dispatcher — do not manage your own agent presence.\n\n"
            f"When done, save a short context summary to {summary_file}."
        )
        return [
            "codex",
            "--model",
            config.model,
            "--full-auto",
            "--prompt",
            prompt,
        ]

    else:
        raise ValueError(f"unknown backend: {config.backend}")


def run_agent(config: AgentConfig, project: str | None = None) -> int:
    """Invoke an agent with retry logic, managing its presence lifecycle."""
    label = f"{config.role}" + (f"/{project}" if project else "")
    username = config.role.lower()

    attempt = 0

    while True:
        attempt += 1

        # --- Dispatcher owns presence ---
        set_presence(username, "running", project)

        cmd = build_agent_command(config, project)
        print(
            f"  dispatch: role={config.role} backend={config.backend} "
            f"model={config.model} effort={config.effort} "
            f"project={project or '<all>'}"
        )

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
            subprocess.run(
                ["git", "add"] + [str(p) for p in Path("cache").glob("*summary")],
                capture_output=True,
            )
            subprocess.run(
                [
                    "git",
                    "commit",
                    "-m",
                    f"run_agent: commit {config.role} summary cache",
                ],
                capture_output=True,
            )
            subprocess.run(["git", "push"], capture_output=True)
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
            print(
                f"  GIVE UP: {label} — failed {attempt} attempts (last exit {exit_code})"
            )
            journal(
                f"gave up on {label} after {attempt} attempts (exit {exit_code})",
                project,
            )
            return exit_code

        delay = strategy["delays"][min(attempt - 1, len(strategy["delays"]) - 1)]
        print(
            f"  RETRY: {label} — exit {exit_code}, waiting {delay}s (attempt {attempt}/{strategy['max_attempts']})"
        )
        time.sleep(delay)


def dispatch_cycle(agents: list[AgentConfig], allow_architect: bool):
    """Run one dispatch cycle."""

    # Check for stale blocked tasks
    check_stale_blocked_tasks()

    # Advance stale projects through the pipeline
    check_stale_development_projects()
    check_stale_pipeline_projects()

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

    with concurrent.futures.ThreadPoolExecutor(max_workers=_dispatch.max_workers) as executor:
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
    global _dispatch

    allow_architect = len(sys.argv) > 1 and sys.argv[1] == "yes"
    agents, _dispatch = load_config()

    print(
        f"agentine dispatcher starting (architect={'enabled' if allow_architect else 'disabled'})"
    )
    print(f"  api: {API_URL}")
    print(f"  agents: {', '.join(a.role for a in agents)}")
    print(
        f"  timing: short={_dispatch.short_break}s long={_dispatch.long_break}s "
        f"every={_dispatch.long_break_every} workers={_dispatch.max_workers}"
    )

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
        print(f"\n{'=' * 40}")
        print(f"iteration {iteration}")
        print(f"{'=' * 40}")

        dispatch_cycle(agents, allow_architect)

        if iteration > 0 and iteration % _dispatch.long_break_every == 0:
            print(f"long break: {_dispatch.long_break}s...")
            time.sleep(_dispatch.long_break)
        else:
            print(f"short break: {_dispatch.short_break}s...")
            time.sleep(_dispatch.short_break)

        iteration += 1


if __name__ == "__main__":
    main()
