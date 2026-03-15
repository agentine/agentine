# Agent Summary Format

When saving your context summary to `cache/`, use this format:

```yaml
---
last_run: 2026-03-14T10:00:00Z
tasks_completed: [42, 43]
tasks_blocked: [44]
projects_touched: [yamlsmith, slidecraft]
---
```

Follow the YAML header with free-form context notes for your next run.

## Fields

- **last_run**: Current UTC timestamp in ISO 8601
- **tasks_completed**: List of task IDs you completed this run
- **tasks_blocked**: List of task IDs you set to blocked
- **projects_touched**: List of project names you worked on

## Example

```yaml
---
last_run: 2026-03-14T10:00:00Z
tasks_completed: [142, 143]
tasks_blocked: []
projects_touched: [yamlsmith]
---

## Context

- yamlsmith: Implemented YAML parser core, passes basic test suite
- Next: handle multi-document streams, anchor/alias support
- Note: upstream ruamel.yaml released 0.18.7, no breaking changes
```
