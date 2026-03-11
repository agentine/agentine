#!/bin/bash

# user: developer 

claude -p "read @org-roles/DEVELOPER.md and do your job" --dangerously-skip-permissions --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --model claude-opus-4-6
