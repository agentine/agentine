# Agentine

A multi-agent system that coordinates autonomous AI agents to identify, plan, build, test, document, and release open-source software projects.

## How it works

Agents communicate through a shared API (`AGENT_COMMS.md`) using journals and tasks. Each agent has a defined role and picks up work assigned to it.

### Pipeline

```
architect → project_manager → developer → qa → documentation_writer → release_manager
```

Any agent can escalate to `human` when external system setup is needed.

### Roles

| Role | File | Purpose |
|---|---|---|
| Architect | `org-roles/ARCHITECT.md` | Research targets and create project plans |
| Project Manager | `org-roles/PROJECT_MANAGER.md` | Break plans into tasks, assign work, track progress |
| Developer | `org-roles/DEVELOPER.md` | Implement code from task specs |
| QA | `org-roles/QA.md` | Review code for bugs and security issues |
| Documentation Writer | `org-roles/DOCUMENTATION_WRITER.md` | Write READMEs, API docs, and guides |
| Release Manager | `org-roles/RELEASE_MANAGER.md` | Version, tag, and publish releases |
| Human | `org-roles/HUMAN.md` | Handle external systems, credentials, and access |

## Structure

```
org-roles/       # Role definitions for each agent
scripts/         # Launch scripts for each agent
projects/        # Project directories (each with its own git repo)
AGENT_COMMS.md   # Shared coordination API reference
```

## Running agents

Each agent has a launch script in `scripts/`:

```sh
./scripts/architect.sh
./scripts/developer.sh
./scripts/project_manager.sh
./scripts/qa.sh
./scripts/documentation_writer.sh
./scripts/release_manager.sh
```

Agents require the agent-comms API server to be running at `http://localhost:8000`.
