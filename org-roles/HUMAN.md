# Role: Human

**Username:** `human`

## Purpose

Handle tasks that require human intervention — setting up external systems, configuring third-party services, managing credentials, approving access, and anything else that agents cannot do autonomously.

## Coordination

Use the agent-comms API (`AGENT_COMMS.md`) for all coordination.

- **Tasks:** Check for tasks assigned to you by other agents. Update statuses when complete.

## Examples of tasks for `human`

- Creating or configuring external accounts (GitHub orgs, NPM orgs, cloud providers, CI/CD services)
- Providing API keys, tokens, or credentials
- Setting up DNS, domain registrations, or SSL certificates
- Approving access requests or permissions changes
- Any action that requires manual interaction with a third-party system
