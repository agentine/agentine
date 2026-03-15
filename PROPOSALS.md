# Agentine Improvement Proposals

Proposals for improving orchestration, observability, and resilience. Ordered
roughly by impact. Each proposal is independent but several reinforce each
other (noted where relevant).

**Codebase references:**
- Agent-comms API: `projects/agent-comms/agent_api/`
  - Schema/tables: `database.py` (journal, tasks, agents, api_keys)
  - Pydantic models: `models.py`
  - Routers: `routers/` (agents.py, tasks.py, journal.py, keys.py, ui.py)
  - Entry point: `main.py`
- Orchestration: `scripts/agent_loop.sh`, `scripts/run_agent.sh`
- Role definitions: `org-roles/*.md`

---

## 1. Python Dispatcher with Managed Agent Lifecycle

### Problem

`agent_loop.sh` runs every agent in a fixed sequence on every iteration. An
agent with no pending tasks still gets invoked (burning tokens and time), and
an agent with urgent work waits for its turn. The 30-minute break every 4
iterations is a blunt cooldown that doesn't account for actual workload.

Additionally, agents self-report their presence via `POST /agents`. If an
agent crashes, runs out of context, or times out, it never posts `"idle"` and
appears stuck forever. The orchestrator has no cleanup mechanism, so stale
presence records accumulate and break project locking (proposal 9).

### Proposal

Replace `agent_loop.sh` with a Python dispatcher (`scripts/dispatch.py`) that:

1. **Owns agent presence** — the dispatcher registers agents as `"running"`
   before invocation and sets them `"idle"` after, regardless of exit code.
   Agents no longer self-report presence.
2. **Cleans up on startup** — resets all agents to `"idle"` since nothing
   should be running when the dispatcher starts.
3. **Only invokes agents with work** — checks pending tasks before spawning.
4. **Handles signals** — catches SIGINT/SIGTERM and cleans up running agents.

#### Sketch: `scripts/dispatch.py`

```python
#!/usr/bin/env python3
"""Agentine dispatcher — owns agent lifecycle and presence."""

import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass

import requests

API = "https://agentine.mtingers.com"
API_KEY = os.environ["API_KEY"]
HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

# Roles that generate work and should always run (no task check)
GENERATORS = {"ARCHITECT", "COMMUNITY_MANAGER"}


@dataclass
class AgentConfig:
    role: str
    backend: str
    model: str
    effort: str


def load_config(path: str = "agents.conf") -> list[AgentConfig]:
    agents = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            role, backend, model, effort = line.split("|")
            agents.append(AgentConfig(role, backend, model, effort))
    return agents


def api(method: str, path: str, **kwargs) -> requests.Response:
    return requests.request(method, f"{API}{path}", headers=HEADERS, **kwargs)


def set_presence(username: str, status: str, project: str | None = None):
    payload = {"username": username, "status": status}
    if project:
        payload["project"] = project
    api("POST", "/agents", json=payload)


def clear_all_presence():
    """Reset all agents to idle on startup — nothing should be running."""
    resp = api("GET", "/agents?status=running")
    if resp.ok:
        for agent in resp.json().get("items", []):
            username = agent["username"]
            print(f"  cleanup: {username} was stuck as 'running', setting idle")
            set_presence(username, "idle")


def has_work(username: str) -> bool:
    for status in ("pending", "in_progress"):
        resp = api("GET", f"/tasks?username={username}&status={status}&limit=1")
        if resp.ok and resp.json().get("total", 0) > 0:
            return True
    return False


def get_pending_projects(username: str) -> list[str]:
    """Return unique projects with pending/in_progress tasks for this agent."""
    projects = set()
    for status in ("pending", "in_progress"):
        resp = api("GET", f"/tasks?username={username}&status={status}&limit=100")
        if resp.ok:
            for task in resp.json().get("items", []):
                if task.get("project"):
                    projects.add(task["project"])
    return sorted(projects)


def project_locked(project: str) -> bool:
    """Check if any agent is already running on this project."""
    resp = api("GET", "/agents?status=running")
    if resp.ok:
        for agent in resp.json().get("items", []):
            if agent.get("project") == project:
                return True
    return False


def run_agent(config: AgentConfig, project: str | None = None):
    """Invoke an agent, managing its presence lifecycle."""
    label = f"{config.role}" + (f"/{project}" if project else "")

    # --- Dispatcher owns presence ---
    set_presence(config.role.lower(), "running", project)

    cmd = [
        "scripts/run_agent.sh",
        config.role,
        config.backend,
        config.model,
        config.effort,
    ]
    if project:
        cmd.append(project)

    print(f"  START: {label}")
    try:
        result = subprocess.run(cmd)
        exit_code = result.returncode
    except Exception as e:
        print(f"  ERROR: {label} — {e}")
        exit_code = 1
    finally:
        # --- Always clean up presence, even on crash ---
        set_presence(config.role.lower(), "idle")

    if exit_code == 0:
        print(f"  DONE: {label}")
        # Commit cache summary
        subprocess.run(
            ["git", "add", "cache/*summary"],
            capture_output=True,
        )
        subprocess.run(
            ["git", "commit", "-m", f"run_agent: commit {config.role} summary cache"],
            capture_output=True,
        )
    else:
        print(f"  FAIL: {label} (exit {exit_code})")

    return exit_code


def dispatch_cycle(agents: list[AgentConfig], allow_architect: bool):
    for config in agents:
        if config.role == "ARCHITECT" and not allow_architect:
            print(f"  SKIP: {config.role} (disabled)")
            continue

        if config.role in GENERATORS:
            # Generators always run (they create work for others)
            run_agent(config)
        elif has_work(config.role.lower()):
            # Project-scoped dispatch (proposal 9): run per-project
            projects = get_pending_projects(config.role.lower())
            for project in projects:
                if not project_locked(project):
                    run_agent(config, project)
                else:
                    print(f"  SKIP: {config.role}/{project} (locked)")
        else:
            print(f"  SKIP: {config.role} (no pending tasks)")


def main():
    allow_architect = len(sys.argv) > 1 and sys.argv[1] == "yes"
    agents = load_config()

    # Clean up any stale presence from a previous crashed run
    print("startup: clearing stale agent presence...")
    clear_all_presence()

    # Clean up on exit too
    def handle_signal(sig, frame):
        print("\nshutdown: clearing agent presence...")
        clear_all_presence()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    iteration = 0
    while True:
        print(f"\n--- iteration {iteration} ---")
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
```

#### What changes for agents

Remove the self-reporting from role definitions and agent prompts:

- **Delete** from role instructions: "Register presence on startup" and
  "set status to idle on finish" — the dispatcher handles this now.
- **Keep** the agent-comms API available to agents for tasks and journal —
  only presence management moves to the dispatcher.

#### Startup cleanup

`clear_all_presence()` runs on every dispatcher start. This handles:
- Previous dispatcher crashed mid-run
- Agent process was killed externally
- Machine rebooted during a run
- Any agent that failed to post "idle"

#### Why Python over shell

The dispatcher is accumulating responsibilities (API calls, JSON parsing,
process management, signal handling, project locking, retry logic) that are
painful in POSIX shell:
- `jq` piping for JSON is fragile and hard to read
- No structured error handling (`set -e` is a footgun)
- Process management with `&`/`wait`/`trap` doesn't compose well
- No data structures for tracking running agents or project locks
- Retry logic with classified exit codes (proposal 6) needs conditionals
  that are awkward in shell

Python with `requests` and `subprocess` is a natural fit and already
available in the Docker image.

#### Migration

1. Keep `run_agent.sh` (or `backends/claude.sh`) as the thin CLI invoker —
   the dispatcher calls it as a subprocess.
2. Remove presence registration from agent role definitions
   (`org-roles/*.md`) and from the agent prompt in `run_agent.sh`.
3. Replace `agent_loop.sh` with `dispatch.py`.
4. `agent_loop.sh` can remain as a wrapper:
   `exec python3 scripts/dispatch.py "$@"`

---

## 2. Backend Dispatch Layer (multi-backend execution)

### Problem

Agent execution is hardcoded to the Claude Code CLI. The coupling lives in two
places:

1. **`agent_loop.sh`** — maps each agent to a Claude model and effort level
2. **`run_agent.sh`** — constructs a `claude` CLI invocation with those params

There's no seam to swap the runtime without forking the scripts.

### Why not use Claude Code's `--agent`/`--agents` flags?

Claude Code supports `--agent <name>` and `--agents <json>` to declare custom
subagents with per-agent model and tool settings. These flags would tidy up the
Claude path but they are **Claude-only** — there is no way to point an agent at
a non-Claude backend. Using them would mean maintaining two parallel config
systems.

### What's already backend-agnostic

Most of the system doesn't care which LLM runs underneath:

- **Role definitions** (`org-roles/*.md`) — pure markdown, no Claude directives
- **Agent-comms API** — coordination via HTTP, indifferent to the caller
- **Cache summaries** (`cache/*.summary`) — plain text
- **Project scaffolding** (`templates/`) — no LLM dependency

The coupling is confined to `run_agent.sh` and the model column in
`agent_loop.sh`.

### Proposal

Introduce a `backends/` directory with one runner script per supported backend.
Each script implements the same interface.

#### Directory layout

```
backends/
  claude.sh      # current run_agent.sh logic, extracted
  codex.sh       # OpenAI Codex CLI runner
  opencode.sh    # opencode runner
```

#### Runner interface

```
backends/<backend>.sh <ROLE_NAME> <MODEL> <EFFORT>
```

Each backend script must:
1. Read `org-roles/$ROLE_NAME.md` and `cache/$ROLE_NAME.summary`
2. Invoke the backend CLI with the appropriate model and prompt
3. Exit 0 on success, non-zero on failure

#### Agent config file

Replace the inline `agents_flow` variable with `agents.conf`:

```
# agents.conf
# ROLE | BACKEND | MODEL | EFFORT
ARCHITECT|claude|claude-opus-4-6|high
PROJECT_MANAGER|claude|claude-sonnet-4-6|medium
COMMUNITY_MANAGER|claude|claude-sonnet-4-6|high
DEVELOPER|claude|claude-opus-4-6|max
QA|claude|claude-opus-4-6|max
DOCUMENTATION_WRITER|claude|claude-sonnet-4-6|high
RELEASE_MANAGER|claude|claude-sonnet-4-6|high
```

#### run_agent.sh becomes a thin dispatcher

```sh
#!/bin/sh
name="$1"
backend="$2"
model="$3"
effort="$4"

if [ -z "$name" ] || [ -z "$backend" ] || [ -z "$model" ] || [ -z "$effort" ]; then
  echo "usage: $0 <ROLE> <BACKEND> <MODEL> <EFFORT>"
  exit 1
fi

script="backends/$backend.sh"
if [ ! -x "$script" ]; then
  echo "error: unknown backend '$backend' (no $script found)"
  exit 1
fi

echo "dispatch: role=$name backend=$backend model=$model effort=$effort"
exec "$script" "$name" "$model" "$effort"
```

#### backends/claude.sh

Today's `run_agent.sh` logic, extracted:

```sh
#!/bin/sh
name="$1"
model="$2"
effort="$3"

claude -p "0. Read @org-roles/$name.md .\
  1. Read previous context summary at @cache/$name.summary (if exists).\
  2. Do your job.\
  3. Finally, save a new short and concise context summary to cache/$name.summary for next run." \
  --dangerously-skip-permissions \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --model "$model" \
  --effort "$effort"
```

#### backends/codex.sh (sketch)

```sh
#!/bin/sh
name="$1"
model="$2"
effort="$3"

role_content=$(cat "org-roles/$name.md")
summary=$(cat "cache/$name.summary" 2>/dev/null || echo "(no prior context)")

codex --model "$model" \
  --full-auto \
  --prompt "You are: $name

$role_content

Previous context summary:
$summary

Do your job. When done, save a short context summary to cache/$name.summary."
```

#### Effort/reasoning mapping

Each backend script owns the translation from generic effort levels:

| Effort | Claude (`--effort`) | Codex (reasoning) | OpenCode |
|--------|--------------------|--------------------|----------|
| low    | `low`              | (default)          | TBD      |
| medium | `medium`           | (default)          | TBD      |
| high   | `high`             | `high`             | TBD      |
| max    | `max`              | `high`             | TBD      |

#### Migration path

1. Extract `backends/claude.sh` from current `run_agent.sh` — no behavior
   change
2. Create `agents.conf` with the current flow plus a `claude` backend column
3. Rewrite `run_agent.sh` as the dispatcher
4. Update `agent_loop.sh` to read `agents.conf`
5. Test that the loop runs identically
6. Add new backends one at a time and test individual agents against them

Steps 1-5 are a pure refactor. Step 6 is where experimentation starts.

#### Open questions

- **Prompt portability**: Role definitions assume Claude Code capabilities
  (e.g., `@file` references). Preprocess per backend, or keep a
  backend-neutral prompt format?
- **Tool access**: Claude Code provides filesystem, git, bash via built-in
  tools. Other backends have different tool/sandbox models. How to normalize?
- **Output format**: We parse `--output-format stream-json` from Claude. Other
  backends stream differently. Is exit code sufficient?
- **Fallback chains**: Should we support "try Codex, fall back to Claude"?
- **Credentials**: Keep in env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) or
  centralize?

---

## 3. Structured Agent Summaries

### Problem

`cache/{AGENT}.summary` files are free-form text. The dispatcher and
monitoring tools can't extract actionable state programmatically — they'd have
to parse natural language to know what an agent did last run.

### Proposal

Add a structured YAML header to each summary while keeping the free-form body
for LLM consumption:

```yaml
---
last_run: 2026-03-14T10:00:00Z
tasks_completed: [42, 43]
tasks_blocked: [44]
projects_touched: [yamlsmith, slidecraft]
---

## Context

(free-form notes for the agent's next run — same as today)
```

The dispatcher (proposal 1) can parse the header with a simple `sed`/`yq`
call to make smarter decisions:
- Skip an agent whose blocked tasks haven't been unblocked since last run
- Prioritize agents that had high throughput last run
- Detect agents that are stuck (same blocked tasks across multiple runs)

#### Implementation

Update the prompt in `run_agent.sh` (or `backends/claude.sh`) to instruct the
agent to write the structured header. Add a post-run validation step that
checks the header is parseable.

---

## 4. Dead-Letter Escalation for Blocked Tasks

### Problem

Tasks set to `blocked` can sit indefinitely. There's no timeout or automatic
escalation beyond manually creating a HUMAN task. An agent might block on
another agent's output that never comes.

### Proposal

#### API changes (`projects/agent-comms/agent_api/`)

1. Add `blocked_at` and `blocked_reason` columns to the `tasks` table in
   `database.py`. Set `blocked_at` automatically in the tasks router
   (`routers/tasks.py`) when status changes to `blocked`.
2. Add `blocked_reason` to `TaskUpdate` in `models.py`.
3. Add `older_than` query parameter to `GET /tasks` in `routers/tasks.py`:
   `GET /tasks?status=blocked&older_than=6h`

#### Dispatcher integration

The dispatcher (proposal 1) checks for stale blocked tasks at the start of
each iteration:

```sh
stale=$(curl -s -H "X-API-Key: $API_KEY" \
  "$API/tasks?status=blocked&older_than=6h" | jq '.total')

if [ "$stale" -gt 0 ]; then
  echo "WARNING: $stale tasks blocked >6h — escalating to HUMAN"
  # Create HUMAN tasks or send notification
fi
```

#### Escalation rules

| Blocked duration | Action                                    |
|-----------------|-------------------------------------------|
| < 6 hours       | Normal — wait for dependency              |
| 6-24 hours      | Log warning, re-assign if possible        |
| > 24 hours      | Auto-create HUMAN task, flag in journal    |

---

## 5. Observability: Status Endpoint and Run Logging

### Problem

There's no way to see what's happening without reading logs, cache files, or
querying SQLite directly. No cost tracking for agent runs.

### Proposal

#### A. Status endpoint (`projects/agent-comms/agent_api/routers/`)

Add a new `status.py` router with `GET /status` that returns an aggregate
view (queries the existing `agents` and `tasks` tables in `database.py`):

```json
{
  "agents": {
    "developer": { "status": "running", "last_heartbeat": "2026-03-14T10:05:00Z" },
    "qa": { "status": "idle", "last_heartbeat": "2026-03-14T09:45:00Z" }
  },
  "tasks": {
    "pending": 12,
    "in_progress": 3,
    "blocked": 2,
    "done_today": 8
  },
  "blocked_tasks": [
    { "id": 44, "title": "...", "blocked_since": "2026-03-14T04:00:00Z" }
  ]
}
```

#### B. Run log table (`projects/agent-comms/agent_api/database.py`)

Add a `runs` table alongside the existing `journal`, `tasks`, and `agents`
tables, with a corresponding router at `routers/runs.py`:

```sql
CREATE TABLE runs (
  id INTEGER PRIMARY KEY,
  agent TEXT NOT NULL,
  backend TEXT NOT NULL,
  model TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  exit_code INTEGER,
  tasks_completed INTEGER DEFAULT 0,
  duration_seconds INTEGER
);
```

`run_agent.sh` records start time before invocation and logs the result after:

```sh
start=$(date -u +%Y-%m-%dT%H:%M:%SZ)
"$script" "$name" "$model" "$effort"
exit_code=$?
end=$(date -u +%Y-%m-%dT%H:%M:%SZ)

curl -s -X POST -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  "$API/runs" \
  -d "{\"agent\":\"$name\",\"backend\":\"$backend\",\"model\":\"$model\",\"started_at\":\"$start\",\"finished_at\":\"$end\",\"exit_code\":$exit_code}"
```

#### C. Token/cost tracking

Extend the `runs` table with `input_tokens`, `output_tokens`, `cost_usd`
columns. Parse these from Claude Code's `stream-json` output (it includes
usage data) and log them per run. Other backends would populate these fields
using their own output formats.

---

## 6. Smarter Retry Logic

### Problem

The current exponential backoff (600s initial, 1800s max) treats all failures
identically. A transient API timeout gets the same 10-minute penalty as a
fundamentally broken task spec.

### Proposal

Classify failures and respond differently:

| Exit code | Meaning               | Retry strategy                      |
|-----------|-----------------------|-------------------------------------|
| 1         | General error         | Backoff: 60s → 300s → 600s (3 max) |
| 2         | Bad input / config    | Don't retry, log and skip           |
| 137/139   | OOM / crash           | Backoff: 300s → 600s (2 max)       |
| Network   | Transient             | Quick retry: 30s → 60s → 120s      |

#### Implementation

1. Define exit code conventions in backend scripts (document in `agents.conf`
   or a separate `EXIT_CODES.md`)
2. Update `run_with_retry` to read exit code and select retry strategy
3. Log failure category to the runs table (proposal 5B) for post-mortem
   analysis

---

## 7. Project Lifecycle States

### Problem

Projects don't have an explicit lifecycle status. To determine where a project
stands, you'd need to infer it from task states across multiple API queries.
This makes the ARCHITECT's concurrency limit (max 4 in progress) hard to
enforce reliably.

### Proposal

Add a `projects` table to `projects/agent-comms/agent_api/database.py` and
a corresponding `routers/projects.py`:

```
POST /projects
{ "name": "yamlsmith", "language": "python", "status": "development",
  "description": "replaces ruamel.yaml" }

GET /projects?status=development
PATCH /projects/yamlsmith { "status": "published" }
```

#### Status values

```
discovery → planning → development → testing → documentation → published → maintained
```

#### Benefits

- ARCHITECT queries `GET /projects?status=development` to enforce concurrency
- Dispatcher knows which projects are active
- Status endpoint (proposal 5A) can show project-level progress
- Replaces ad-hoc journal scanning

---

## 8. Parallel Agent Execution

### Problem

DEVELOPER, DOCUMENTATION_WRITER, and COMMUNITY_MANAGER often work on
different projects simultaneously. The sequential loop prevents this —
DOCUMENTATION_WRITER waits for QA to finish even when they'd be working on
completely separate projects.

### Proposal

With project-scoped dispatch (proposal 9), parallelism becomes
straightforward. The dispatcher already spawns agents per-project, so it
simply launches non-conflicting agent+project pairs concurrently:

```sh
# The dispatcher builds a work queue of (agent, project) pairs:
#   (DEVELOPER, yamlsmith)
#   (DEVELOPER, slidecraft)
#   (QA, markuptree)
#   (DOCUMENTATION_WRITER, ciphertrust)
#
# Filter out conflicts (same project), then launch in parallel:

for pair in $work_queue; do
  agent=$(echo "$pair" | cut -d, -f1)
  project=$(echo "$pair" | cut -d, -f2)

  if ! project_locked "$project"; then
    run_agent "$agent" "$backend" "$model" "$effort" "$project" &
  fi
done
wait
```

This is a natural extension of proposal 9 — the per-project locking mechanism
already prevents conflicts, so parallelism is just backgrounding the
invocations.

#### Constraints

- Never run two file-modifying agents on the **same project** concurrently
  (enforced by project locking from proposal 9)
- ARCHITECT and PROJECT_MANAGER are cross-project and run sequentially
- Same-role parallelism is safe (two DEVELOPERs on different projects)

#### Prerequisites

- Proposal 1 (event-driven scheduling)
- Proposal 9 (project-scoped dispatch) — provides the locking mechanism

---

## 9. Project-Scoped Agent Dispatch

### Problem

Today, the dispatcher invokes "DEVELOPER" and the agent queries its full task
queue, discovers which projects need work, and decides what to focus on. This
has several consequences:

1. **No focus** — an agent with tasks across 5 projects may context-switch
   between them in a single run, or pick the lowest-priority one first.
2. **No same-role parallelism** — you can't run two DEVELOPER instances on
   different projects simultaneously. There's one "developer" identity and one
   cache file.
3. **Wasted context** — the agent loads role instructions and prior summary,
   then spends tokens querying the API to figure out *which* project to work
   on. The dispatcher already has this information.
4. **No project-level concurrency control** — nothing prevents DEVELOPER and
   QA from running on the same project simultaneously (which would cause git
   conflicts).

### Proposal

Make project the primary dispatch unit. Instead of invoking an agent
generically, the dispatcher invokes an agent *for a specific project*.

#### Dispatch interface change

```
# Before (current)
run_agent.sh DEVELOPER claude claude-opus-4-6 max

# After
run_agent.sh DEVELOPER claude claude-opus-4-6 max yamlsmith
```

The project name becomes a required argument (except for ARCHITECT and
PROJECT_MANAGER, which operate cross-project). The backend script passes it
to the agent prompt so the agent knows exactly where to focus.

#### Updated backends/claude.sh

```sh
#!/bin/sh
name="$1"
model="$2"
effort="$3"
project="$4"  # optional — empty for cross-project roles

project_clause=""
if [ -n "$project" ]; then
  project_clause="Focus exclusively on project: $project. Only work on tasks where project=$project."
fi

claude -p "0. Read @org-roles/$name.md .
  1. Read previous context summary at @cache/$name.summary (if exists).
  2. $project_clause
  3. Do your job.
  4. Finally, save a new short and concise context summary to cache/$name.summary for next run." \
  --dangerously-skip-permissions \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --model "$model" \
  --effort "$effort"
```

#### Dispatcher integration

The Python dispatcher (proposal 1) already implements this. Its
`dispatch_cycle` queries pending tasks per agent, groups by project, checks
project locks, and spawns focused invocations. The dispatcher also owns
presence — it sets the agent's project in the `/agents` record before
invocation, which is what makes project locking reliable.

This naturally enables **same-role parallelism** — two DEVELOPER instances
can run concurrently on different projects because they're scoped to separate
directories.

#### Per-project cache (optional)

With project-scoped dispatch, cache files could also be scoped:

```
cache/DEVELOPER.summary              # global context (cross-run memory)
cache/DEVELOPER.yamlsmith.summary    # project-specific context
```

The agent reads both: the global summary for general patterns and the
project-specific one for where it left off. This prevents project A's context
from polluting project B's run.

#### Project locking

The Python dispatcher (proposal 1) owns presence and sets the project field
when registering an agent as `"running"`. Before launching a new agent on a
project, it checks `/agents?status=running` for any agent already on that
project. Because the dispatcher manages presence (not the agents themselves),
locks are always cleaned up — even if the agent crashes.

#### Conflict rules

| Agent A on project X | Agent B on project X | Allowed? |
|---------------------|---------------------|----------|
| DEVELOPER           | QA                  | No       |
| DEVELOPER           | DOCUMENTATION_WRITER| No       |
| QA                  | DOCUMENTATION_WRITER| No       |
| DEVELOPER (X)       | DEVELOPER (Y)       | Yes      |
| Any role            | COMMUNITY_MANAGER   | Yes      |

Any two agents that modify files in `projects/{name}/` must not run
concurrently on the same project. COMMUNITY_MANAGER only triages issues and
creates tasks, so it's safe to overlap.

#### Prerequisites

- Proposal 1 (event-driven scheduling) — the sequential loop can't express
  per-project dispatch.
- Proposal 7 (project lifecycle states) is helpful but not required — the
  dispatcher can derive active projects from task data alone.

---

## 10. Template Drift Detection

### Problem

Templates in `templates/` are point-in-time snapshots. Once a project is
scaffolded, CI workflows, Makefile targets, linter configs, and other
boilerplate diverge from the current template. Updating a CI workflow means
manually patching 33 repos.

### Proposal

Add a `commands/sync-templates.sh` that diffs a project's boilerplate files
against the current template:

```sh
#!/bin/sh
# commands/sync-templates.sh <projectname>
project="$1"
lang=$(detect_language "projects/$project")

# Files to sync (not project-specific source code)
for f in Makefile .github/workflows/ci.yml .github/workflows/publish.yml \
         .github/dependabot.yml; do
  template="templates/$lang/$f"
  target="projects/$project/$f"

  if [ -f "$template" ] && [ -f "$target" ]; then
    if ! diff -q "$template" "$target" >/dev/null 2>&1; then
      echo "DRIFT: $target differs from template"
      diff -u "$template" "$target" | head -20
    fi
  fi
done
```

A DEVELOPER or PROJECT_MANAGER task could periodically run this and create
update tasks for drifted files.

---

## Priority and Dependencies

```
High impact, low effort (do first):
  1. Event-driven scheduling
  3. Structured summaries
  6. Smarter retry logic

High impact, moderate effort:
  9. Project-scoped dispatch (requires 1)
  4. Dead-letter escalation
  5. Observability
  7. Project lifecycle states

Medium impact, enables future work:
  2. Backend dispatch layer
  8. Parallel execution (requires 1, enabled by 9)
  10. Template drift detection
```

The highest-leverage sequence is **1 → 9 → 8**: the Python dispatcher owns
agent lifecycle (fixing stuck presence), enables event-driven scheduling,
and provides the foundation for project-scoped dispatch, which in turn makes
same-role parallelism trivial. Together these eliminate wasted runs, prevent
context-switching, fix stale presence, and let multiple DEVELOPER instances
work on different projects concurrently.

Proposal 5 (observability) pairs well with any of these — add it early so you
can measure the impact of subsequent changes. Proposal 2 (multi-backend) is
the right long-term architecture but lower priority while running
single-backend.
