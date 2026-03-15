# Agent Coordination API (AGENT_COMMS)

Base URL: **`$API_URL`** (from environment variable). The API_URL and API_KEY environment variables are pre-set by the dispatcher.

This API is the **only coordination channel between agents**. Use it to read tasks, record progress, and coordinate work. Agents must not assume shared memory outside this API.

# Hard Rule: Use the API wrapper

**Always use `scripts/api.sh` for ALL API calls.** It reads `API_URL` and `API_KEY` from the environment and handles authentication automatically.

    scripts/api.sh GET /tasks?username=developer&status=pending
    scripts/api.sh POST /tasks '{"username":"developer","project":"foo","title":"example","status":"pending","priority":3}'
    scripts/api.sh PATCH /tasks/42 '{"status":"done"}'

**NEVER use raw curl, NEVER hardcode a URL, NEVER use localhost.** The wrapper ensures you always hit the correct API.

# Required Startup Procedure

> **Note:** Agent presence (running/idle) is managed by the dispatcher. Do not register or deregister yourself.

## 1. Check Your Tasks

    GET /tasks?username=YOUR_USERNAME&status=pending
    GET /tasks?username=YOUR_USERNAME&status=in_progress

Only query your own tasks unless you are `project_manager`.

## 2. Process Tasks

    pending → set in_progress → perform work → set done

## 3. Write Journal Updates

    POST /journal

Log research results, decisions, blockers, implementation summaries. The journal is shared memory between agents.

# Pagination

All list endpoints support pagination. Response format:

    { "total": 120, "items": [...] }

Fetch additional pages while `offset + limit < total`. Default limit is 50.

    GET /tasks?username=developer&limit=50&offset=0
    GET /tasks?username=developer&limit=50&offset=50

# Journal API

## Create Entry

    POST /journal
    { "username": "agent_name", "project": "optional", "content": "message" }

Response: `201` with id, username, project, content, created_at.

## List Entries

    GET /journal
    GET /journal?username=architect
    GET /journal?project=myproject
    GET /journal?limit=50&offset=0

Returns newest first.

# Task API

Tasks are units of work assigned to agents. Only work on tasks assigned to you.

## Status Values

| Status      | Meaning                 |
| ----------- | ----------------------- |
| pending     | created but not started |
| in_progress | work happening          |
| blocked     | waiting on dependency   |
| done        | completed               |
| cancelled   | intentionally abandoned |

Lifecycle: `pending → in_progress → done` or `in_progress → blocked → in_progress → done`

## Create Task

    POST /tasks
    { "username": "assignee", "project": "optional", "title": "short description",
      "description": "optional details", "status": "pending", "priority": 1 }

Priority: 1 (lowest) to 5 (highest).

## List Tasks

    GET /tasks?username=YOUR_USERNAME&status=pending
    GET /tasks?project=myproject
    GET /tasks?status=blocked
    GET /tasks?priority=5
    GET /tasks?older_than=7d

The `older_than` query parameter filters tasks by age (e.g. `7d`, `24h`). Returns highest priority first. Supports pagination.

## Get / Update / Delete

    GET /tasks/{id}
    PATCH /tasks/{id}    { "status": "in_progress" }
    PATCH /tasks/{id}    { "status": "blocked", "blocked_at": "2026-03-14T10:00:00Z", "blocked_reason": "waiting on upstream fix" }
    DELETE /tasks/{id}   (prefer status=cancelled over delete)

When setting a task to `blocked`, include `blocked_at` (ISO 8601 timestamp) and `blocked_reason` (free-form string describing the blocker).

# Agent Presence API (dispatcher-managed)

**Do not call these endpoints.** Agent presence is managed by the dispatcher, which registers you as `running` before your invocation and sets you to `idle` after — even if you crash. You may read presence to check if another agent is active, but never write to it.

    GET /agents                  # list all agents
    GET /agents?status=running   # check who is running
    GET /agents/{username}       # check a specific agent

# Run Logging API

Runs track individual agent execution sessions.

## Create Run

    POST /runs
    { "username": "agent_name", "project": "optional", "status": "running" }

Response: `201` with id, username, project, status, started_at.

## List Runs

    GET /runs
    GET /runs?username=architect
    GET /runs?status=running

Supports pagination.

## Get / Update Run

    GET /runs/{id}
    PATCH /runs/{id}    { "status": "completed" }

# Project Lifecycle API

Projects track the lifecycle of initiatives from proposal through completion.

## Create Project

    POST /projects
    { "name": "project-name", "description": "optional", "status": "proposed" }

## List / Get Projects

    GET /projects
    GET /projects/{name}

## Update / Delete Project

    PATCH /projects/{name}    { "status": "active" }
    DELETE /projects/{name}

# Aggregate Status API

## Get Status

    GET /status

Returns a combined view of running agents, active projects, and task summary counts.

# Field Rules

| Field    | Rule                                      |
| -------- | ----------------------------------------- |
| username | required on writes, 1-64 chars, no spaces |
| project  | optional string                           |
| priority | integer 1-5                               |

Errors return: `{ "detail": "message" }`
