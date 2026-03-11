#!/bin/bash

# user: project_manager 

claude -p "read @org-roles/PROJECT_MANAGER.md and do your job" --dangerously-skip-permissions --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --model claude-opus-4-6
