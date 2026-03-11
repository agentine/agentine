#!/bin/bash

# user: architect

user_extra=$1
claude -p "read @org-roles/ARCHITECT.md and do your job. $user_extra" --dangerously-skip-permissions --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --model claude-opus-4-6
