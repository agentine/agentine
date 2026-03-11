#!/bin/bash

# user: documentation_writer 

claude -p "read @org-roles/DOCUMENTATION_WRITER.md and do your job" --dangerously-skip-permissions --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --model claude-opus-4-6
