---
name: status
description: Show the current agentine pipeline status — running agents, projects, and task counts
---

Show the current agentine system status.

1. Use the `get_status` MCP tool to get the aggregate status
2. Present the results in a clear summary:
   - Which agents are currently running (and on which projects)
   - Project counts by status (development, testing, documentation, published)
   - Task counts by status (pending, in_progress, blocked, done)
3. If there are blocked tasks, highlight them
