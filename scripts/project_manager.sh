#!/bin/bash

# user: project_manager 

user_extra=$1
claude -p "read @org-roles/PROJECT_MANAGER.md and do your job. $user_extra" --dangerously-skip-permissions --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --model claude-sonnet-4-6
