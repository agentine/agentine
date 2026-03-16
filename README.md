# Agentine

Autonomous scavengers that identify popular software left to rot, creating maintained alternatives to save the ecosystem. What could go wrong?

Open source runs the world, but maintainers burn out, move on, or simply disappear. Critical libraries with millions of downloads quietly fall behind — accumulating CVEs, broken builds, and unanswered issues — while the ecosystem keeps pulling them in. Agentine is a network of autonomous agents that continuously scans for widely-depended-on projects showing signs of abandonment. When a project qualifies, our agents create a fresh alternative — building on the same ideas with security fixes, dependency updates, and community-contributed improvements.

## How it works

### Lifecycle

```
Detect → Evaluate → Create → Release → Steward
```

1. **Detect** — Agents monitor package registries and source hosts for high-impact projects with stale commits, unpatched vulnerabilities, and growing issue counts
2. **Evaluate** — Each candidate is scored on downstream dependency count, severity of open issues, and time since last maintainer activity
3. **Create** — Agents start a new alternative project from scratch, applying security fixes, dependency updates, and community-contributed improvements. The original project is left as-is
4. **Release** — The new alternative is published to package registries, giving downstream consumers a maintained option to migrate to
5. **Steward** — Agents continue maintaining the alternative, keeping it up to date and secure for as long as it's needed

### Agent pipeline

A Python dispatcher (`src/agentine/dispatch.py`) orchestrates agents. It checks pending tasks, dispatches agents per-project, manages presence lifecycle, and runs non-conflicting agents in parallel. Agents communicate through a shared REST API (`AGENT_COMMS.md`) using journals, tasks, and project status.

```
architect → project_manager → community_manager → developer → qa → documentation_writer → release_manager
```

Any agent can escalate to `human` when external system setup is needed.

### Roles

| Role | File | Purpose |
|---|---|---|
| Architect | `org-roles/ARCHITECT.md` | Identify abandoned libraries and create replacement project plans |
| Project Manager | `org-roles/PROJECT_MANAGER.md` | Break plans into tasks, assign work, track progress |
| Community Manager | `org-roles/COMMUNITY_MANAGER.md` | Triage GitHub issues and PRs across projects |
| Developer | `org-roles/DEVELOPER.md` | Implement code from task specs |
| QA | `org-roles/QA.md` | Review code for bugs and security issues |
| Documentation Writer | `org-roles/DOCUMENTATION_WRITER.md` | Write READMEs, API docs, and guides |
| Release Manager | `org-roles/RELEASE_MANAGER.md` | Version, tag, and publish to PyPI/npm/GitHub |
| Human | `org-roles/HUMAN.md` | Handle external systems, credentials, and access |

## Principles

- **Transparency first** — Every automated action is logged and publicly auditable. No black-box commits
- **Security is non-negotiable** — Known vulnerabilities in adopted projects are triaged and patched immediately
- **Respect original maintainers** — Original licenses and attribution are always preserved. We don't touch the original project
- **Fresh alternatives** — Rather than taking over existing projects, we create new ones that consumers can choose to migrate to

## Structure

```
src/agentine/    # Python package: dispatcher, MCP server, shared config
org-roles/       # Role definitions for each agent
templates/       # Language scaffolds (Python, Go, Node) with CI/CD workflows
projects/        # Project directories (each with its own git repo)
cache/           # Agent context summaries for cross-session state
.mcp.json        # MCP server config (auto-discovered by claude)
agents.toml      # Agent config: role, backend, model, and effort per agent
AGENT_COMMS.md   # Shared coordination API reference
PROPOSALS.md     # Improvement proposals and architecture roadmap
```

## Getting started

### Prerequisites

- Python 3.13+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [claude](https://docs.anthropic.com/en/docs/claude-code) CLI (Claude Code)
- [gh](https://cli.github.com/) CLI (authenticated with access to the `agentine` GitHub org)

### Install

```sh
git clone https://github.com/agentine/agentine.git
cd agentine
uv sync
```

### Configure

Create a `.env` file with your agent-comms API credentials:

```sh
API_URL='https://agentine.mtingers.com'
API_KEY='your-api-key-here'
```

### Agent configuration

Edit `agents.toml` to configure which agents run and what models they use:

```toml
[defaults]
backend = "claude"
model = "claude-opus-4-6"
effort = "max"

[[agents]]
role = "DEVELOPER"
# model = "claude-sonnet-4-6"  # override per-agent
```

## Running

### With Docker

```sh
docker compose up
```

See `DOCKER.md` for setup details.

### Locally

```sh
uv run agentine-dispatch yes    # "yes" enables the ARCHITECT agent
uv run agentine-dispatch        # skip ARCHITECT, only run task-driven agents
```

The dispatcher manages agent presence, retries failed agents with classified backoff, and runs non-conflicting agents in parallel.

Agents interact with the coordination API and project utilities through an MCP server (`src/agentine/mcp_server.py`), configured in `.mcp.json` and auto-discovered by the `claude` CLI. The agent-comms API must be running at the URL specified in `.env`.

## Status

37 projects across Python, Go, and JavaScript/TypeScript are in various stages of the pipeline (26 published, 6 in development). Follow the activity at the [agent log site](https://agentine.mtingers.com/ui).
