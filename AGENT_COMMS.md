# Agent Coordination API (AGENT_COMMS)

Base URL

    http://localhost:8000

This API is the **only coordination channel between agents**.

Agents must use it to:

-   register presence
-   read assigned tasks
-   record progress
-   coordinate work

Agents must not assume shared memory outside this API.

------------------------------------------------------------------------

# Required Agent Startup Procedure

Every agent must follow this procedure when starting a run.

## 1. Register Presence

    POST /agents
    {
      "username": "your-agent-name",
      "status": "running",
      "project": "optional"
    }

------------------------------------------------------------------------

## 2. Check Your Tasks

Agents must check **tasks assigned to their own username**.

    GET /tasks?username=YOUR_USERNAME&status=pending

Then also check tasks already in progress:

    GET /tasks?username=YOUR_USERNAME&status=in_progress

Agents must not rely on unfiltered `/tasks` queries unless you are the `project_manager` user role.

------------------------------------------------------------------------

## 3. Process Tasks

For each task:

    pending → set in_progress → perform work → set done

------------------------------------------------------------------------

## 4. Write Journal Updates

Agents should log major steps:

    POST /journal

Examples:

-   research results
-   decisions
-   blockers
-   implementation summaries

The journal acts as **shared memory between agents**.

------------------------------------------------------------------------

## 5. Finish Run

When finished:

    POST /agents
    {
      "username": "your-agent-name",
      "status": "idle"
    }

------------------------------------------------------------------------

# Pagination Rules (Important)

All list endpoints support pagination.

Response format:

    {
      "total": 120,
      "items": [...]
    }

Agents must fetch additional pages if:

    offset + limit < total

Example pagination loop:

    GET /tasks?username=developer&limit=50&offset=0
    GET /tasks?username=developer&limit=50&offset=50
    GET /tasks?username=developer&limit=50&offset=100

Agents should continue requesting pages until all results are fetched.

Default limit should be treated as **50 if not specified**.

------------------------------------------------------------------------

# Journal API

The journal stores **events and decisions**.

Agents should write entries when:

-   starting work
-   completing tasks
-   making design decisions
-   encountering blockers

------------------------------------------------------------------------

## Create Entry

    POST /journal

Request

    {
      "username": "agent_name",
      "project": "optional",
      "content": "message"
    }

Response

    201
    {
      "id": 1,
      "username": "agent_name",
      "project": "example",
      "content": "message",
      "created_at": "timestamp"
    }

------------------------------------------------------------------------

## List Entries

    GET /journal

Filters

    GET /journal?username=architect
    GET /journal?project=myproject
    GET /journal?username=architect&project=myproject
    GET /journal?limit=50&offset=0

Journal entries return **newest first**.

------------------------------------------------------------------------

# Task API

Tasks represent **units of work assigned to agents**.

Agents should only work on tasks assigned to them.

------------------------------------------------------------------------

## Task Status Values

  Status        Meaning
  ------------- ------------------------------
  pending       task created but not started
  in_progress   work currently happening
  blocked       waiting on dependency
  done          completed successfully
  cancelled     intentionally abandoned

Typical lifecycle:

    pending → in_progress → done

Blocked lifecycle:

    in_progress → blocked → in_progress → done

------------------------------------------------------------------------

## Create Task

    POST /tasks

Request

    {
      "username": "assignee",
      "project": "optional",
      "title": "short description",
      "description": "optional details",
      "status": "pending",
      "priority": 1
    }

Priority range:

    1 = lowest
    5 = highest

------------------------------------------------------------------------

## List Tasks

Typical agent query:

    GET /tasks?username=YOUR_USERNAME&status=pending

Other filters:

    GET /tasks?username=developer
    GET /tasks?project=myproject
    GET /tasks?status=blocked
    GET /tasks?priority=5

Pagination:

    GET /tasks?limit=50&offset=0

Tasks are returned **highest priority first**.

------------------------------------------------------------------------

## Get One Task

    GET /tasks/{id}

Response

    200 task object
    404 not found

------------------------------------------------------------------------

## Update Task

    PATCH /tasks/{id}

Example

    {
      "status": "in_progress"
    }

------------------------------------------------------------------------

## Delete Task

    DELETE /tasks/{id}

Use only if the task was created **by mistake**.

Normally prefer:

    status = cancelled

------------------------------------------------------------------------

# Agent Presence API

Tracks which agents are currently active.

------------------------------------------------------------------------

## Register / Heartbeat

    POST /agents

Request

    {
      "username": "agent_name",
      "status": "running",
      "project": "optional"
    }

Calling this again updates:

-   status
-   project
-   updated_at

------------------------------------------------------------------------

## List Agents

    GET /agents
    GET /agents?status=running
    GET /agents?project=myproject

------------------------------------------------------------------------

## Get Agent

    GET /agents/{username}

------------------------------------------------------------------------

## Deregister

    DELETE /agents/{username}

------------------------------------------------------------------------

# Field Rules

  Field      Rule
  ---------- -------------------------------------------------
  username   required on writes, 1--64 characters, no spaces
  project    optional string
  priority   integer 1--5

------------------------------------------------------------------------

# Error Format

Errors return:

    {
      "detail": "message"
    }

------------------------------------------------------------------------

# Key Behavior Rules for Agents

Agents must:

1.  Register presence when starting
2.  Query tasks using their own username
3.  Use pagination for list endpoints
4.  Write journal entries for important events
5.  Update task status during work
6.  Set presence to `idle` when finished
