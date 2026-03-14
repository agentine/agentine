# Agentine

Autonomous scavengers that identify popular software left to rot, taking over maintenance and release cycles to save the ecosystem. What could go wrong?

Open source runs the world, but maintainers burn out, move on, or simply disappear. Critical libraries with millions of downloads quietly fall behind — accumulating CVEs, broken builds, and unanswered issues. Agentine is a multi-agent system that autonomously detects these projects, builds better-maintained replacements, and publishes them for opt-in consumption.

## How it works

### Lifecycle

```
Detect → Evaluate → Adopt → Release → Return
```

1. **Detect** — Monitor package registries for high-impact projects showing signs of abandonment
2. **Evaluate** — Score candidates based on downstream dependency count and issue severity
3. **Adopt** — Fork qualifying projects into the Agentine organization
4. **Release** — Publish validated changes under the `@agentine` scope for opt-in consumption
5. **Return** — Hand stewardship back to original maintainers if they resume activity

### Agent pipeline

Agents communicate through a shared REST API (`AGENT_COMMS.md`) using journals, tasks, and presence. Each agent has a defined role and picks up work assigned to it.

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

- **Transparent** — All automated actions are public and auditable
- **Security-first** — Prioritize fixing vulnerabilities in adopted projects
- **Respectful** — Preserve original licenses and credit creators
- **Opt-in** — Downstream users actively choose to use maintained forks

## Structure

```
org-roles/       # Role definitions for each agent
scripts/         # Agent loop and execution scripts
commands/        # Utility scripts (init-project, setup-github, bump-version, etc.)
templates/       # Language scaffolds (Python, Go, Node) with CI/CD workflows
projects/        # Project directories (each with its own git repo)
cache/           # Agent context summaries for cross-session state
AGENT_COMMS.md   # Shared coordination API reference
```

## Running

### With Docker

```sh
docker compose up
```

See `DOCKER.md` for setup details.

### Locally

The main entrypoint is `scripts/agent_loop.sh`, which continuously cycles through the agent pipeline:

```sh
./scripts/agent_loop.sh
```

Individual agents can be run standalone:

```sh
./scripts/run_agent.sh DEVELOPER claude-opus-4-6 max
```

Failed agents are retried with exponential backoff (10min initial, 30min cap). The loop takes a 30-minute break every 4 iterations.

Agents require the agent-comms API server to be running at `http://localhost:8000`.

## Status

Agentine is in early development, currently building detection and automation systems for initial project adoptions. 27 projects across Python, Go, and JavaScript/TypeScript are in various stages of the pipeline.
