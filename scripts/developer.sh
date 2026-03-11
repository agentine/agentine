#!/bin/bash

# user: developer 

user_extra=$1
claude -p "read @org-roles/DEVELOPER.md and do your job. $user_extra" --dangerously-skip-permissions --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --model claude-opus-4-6
