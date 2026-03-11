#!/bin/bash

# user: release_manager 

claude -p "read @org-roles/RELEASE_MANAGER.md and do your job" --dangerously-skip-permissions --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --model claude-opus-4-6

