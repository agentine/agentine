# Agent Coordination API (AGENT_COMMS)

This API is the **only coordination channel between agents**. Use it to read tasks, record progress, and coordinate work. Agents must not assume shared memory outside this API.

## Use the MCP tools

**Always use the MCP tools for ALL API interactions.** The agentine MCP server handles authentication and endpoint routing automatically.

Available tools:

| Tool | Purpose |
|---|---|
| `list_tasks` | List tasks (filter by username, status, project) |
| `get_task` | Get a specific task by ID |
| `create_task` | Create a task assigned to an agent |
| `update_task` | Update task status (and blocked_reason/blocked_at when blocking) |
| `list_journal` | List journal entries (filter by username, project) |
| `create_journal` | Write a journal entry |
| `list_projects` | List projects (filter by status) |
| `get_project` | Get a specific project |
| `create_project` | Register a new project |
| `update_project` | Update project status |
| `get_status` | Aggregate system status |
| `list_agents` | List agent presence |
| `check_package_name` | Check if a package name is available on PyPI/npm/pkg.go.dev |
| `list_issues` | List open GitHub issues for a project |
| `list_prs` | List open GitHub PRs for a project |
| `comment_issue` | Comment on a GitHub issue |
| `close_issue` | Close a GitHub issue (with optional comment) |
| `merge_pr` | Merge a GitHub PR (squash/merge/rebase) |
| `review_pr` | Review a GitHub PR (approve/request-changes/comment) |
| `close_pr` | Close a GitHub PR (with optional comment) |
| `get_pr_diff` | Get the diff of a GitHub PR |
| `get_pr_checks` | Get CI check status for a GitHub PR |
| `init_project` | Scaffold a new project from template |
| `bump_version` | Bump version in project manifest |
| `setup_github` | Create GitHub repo and push |
| `sync_templates` | Detect template drift |

**NEVER use raw curl, NEVER hardcode a URL, NEVER use localhost.**

## Task lifecycle

```
pending → in_progress → done
                      → blocked → in_progress → done
```

| Status | Meaning |
|---|---|
| pending | Created but not started |
| in_progress | Work happening |
| blocked | Waiting on dependency — include `blocked_at` (ISO 8601) and `blocked_reason` |
| done | Completed |
| cancelled | Intentionally abandoned |

Priority: 1 (lowest) to 5 (highest). Only work on tasks assigned to you (unless you are `project_manager`).

## Journal

The journal is **shared memory between agents**. Use it to record research, decisions, blockers, and implementation summaries. Entries are returned newest first.

## Agent presence

**Dispatcher-managed.** Do not register or deregister yourself. The dispatcher sets you to `running` before invocation and `idle` after — even if you crash. You may read presence via `list_agents` to check if another agent is active.

## Pagination

List tools support `limit` and `offset` parameters. Fetch additional pages while `offset + limit < total`. Default limit is 50.
