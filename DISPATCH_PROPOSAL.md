# Dispatch Layer Proposal: Multi-Backend Agent Execution

## Problem

Agent execution is currently hardcoded to the Claude Code CLI. The coupling
lives in two places:

1. **`agent_loop.sh`** — maps each agent to a Claude model and effort level
2. **`run_agent.sh`** — constructs a `claude` CLI invocation with those params

If we want to run agents against other backends (Codex, OpenCode, Gemini CLI,
etc.), there's no seam to swap the runtime without forking the scripts.

### Why not use Claude Code's `--agent`/`--agents` flags?

Claude Code supports `--agent <name>` and `--agents <json>` to declare custom
subagents with per-agent model and tool settings. These flags would tidy up the
Claude path (declarative config instead of shell variables), but they are
**Claude-only** — there is no way to point an agent at a non-Claude backend.
Using them would mean maintaining two parallel config systems if we ever add
another backend.

## What's Already Backend-Agnostic

The good news is that most of the system doesn't care which LLM runs underneath:

- **Role definitions** (`org-roles/*.md`) — pure markdown instructions, no
  Claude-specific directives
- **Agent-comms API** — coordination via HTTP, indifferent to the caller
- **Cache summaries** (`cache/*.summary`) — plain text, read/written by the
  agent itself
- **Project scaffolding** (`templates/`) — no LLM dependency

The coupling is confined to `run_agent.sh` and the model column in
`agent_loop.sh`.

## Proposal: Backend Dispatch Layer

Introduce a `backends/` directory with one runner script per supported backend.
Each script implements the same interface: accept a role name, a model, an
effort/reasoning level, and invoke the corresponding CLI.

### Directory layout

```
backends/
  claude.sh      # current run_agent.sh logic, extracted
  codex.sh       # OpenAI Codex CLI runner
  opencode.sh    # opencode runner
```

### Runner interface

Every backend script accepts the same positional args:

```
backends/<backend>.sh <ROLE_NAME> <MODEL> <EFFORT>
```

It must:
1. Read `org-roles/$ROLE_NAME.md` and `cache/$ROLE_NAME.summary` (or pass them
   to the backend to read)
2. Invoke the backend CLI with the appropriate model and prompt
3. Exit 0 on success, non-zero on failure

### Agent config

Replace the inline `agents_flow` variable in `agent_loop.sh` with a config file
that adds a backend column:

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

`agent_loop.sh` reads this file and dispatches to `backends/$BACKEND.sh`
instead of calling `run_agent.sh` directly.

### run_agent.sh changes

`run_agent.sh` becomes a thin dispatcher:

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

### Example: backends/claude.sh

This is essentially today's `run_agent.sh`:

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

### Example: backends/codex.sh

Sketch — actual flags TBD based on the Codex CLI:

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

## Effort/Reasoning Mapping

Different backends use different knobs for controlling reasoning depth. The
dispatch layer should translate the generic `EFFORT` value
(`low|medium|high|max`) into each backend's equivalent:

| Effort | Claude (`--effort`)  | Codex (reasoning)  | OpenCode        |
|--------|---------------------|--------------------|-----------------|
| low    | `low`               | (default)          | TBD             |
| medium | `medium`            | (default)          | TBD             |
| high   | `high`              | `high`             | TBD             |
| max    | `max`               | `high`             | TBD             |

Each backend script owns this translation.

## Migration Path

1. **Extract** `backends/claude.sh` from current `run_agent.sh` — no behavior
   change
2. **Create** `agents.conf` with the current flow plus a `claude` backend
   column
3. **Rewrite** `run_agent.sh` as the dispatcher
4. **Update** `agent_loop.sh` to read `agents.conf` instead of the inline
   variable
5. **Test** that the loop runs identically to today
6. **Add** new backends one at a time (`codex.sh`, `opencode.sh`) and test
   individual agents against them

Steps 1-5 are a pure refactor with no functional change. Step 6 is where we
start experimenting.

## Open Questions

- **Prompt portability**: Role definitions are mostly generic, but some assume
  Claude Code capabilities (e.g., `@file` references for inline file reading).
  Do we preprocess these per backend, or keep a backend-neutral prompt format?
- **Tool access**: Claude Code gives agents filesystem access, git, bash, etc.
  via built-in tools. Other backends have different tool/sandbox models. How do
  we normalize this?
- **Output format**: We currently parse `--output-format stream-json` from
  Claude. Other backends stream differently. Does the loop need to care, or is
  exit code sufficient?
- **Per-agent backend overrides**: The config above sets one backend per role.
  Should we support fallback chains (e.g., try Codex, fall back to Claude)?
- **Credentials**: Each backend needs its own API key / auth. Keep in env vars
  (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) or centralize in a secrets
  file?
