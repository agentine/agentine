#!/bin/sh
name="$1"
model="$2"
effort="$3"
project="$4"  # optional — empty for cross-project roles

if [ -z "$name" ] || [ -z "$model" ] || [ -z "$effort" ]; then
  echo "usage: $0 <ROLE> <MODEL> <EFFORT> [PROJECT]"
  exit 2
fi

if [ -f .env ]; then
  . ./.env
fi

project_clause=""
if [ -n "$project" ]; then
  project_clause="Focus exclusively on project: $project. Only work on tasks where project=$project."
fi

summary_file="cache/$name.summary"
if [ -n "$project" ]; then
  project_summary="cache/$name.$project.summary"
  if [ -f "$project_summary" ]; then
    summary_file="$project_summary"
  fi
fi

echo "run: name=$name model=$model effort=$effort project=${project:-<all>}"

claude -p "0. Read @org-roles/$name.md .
  1. Read previous context summary at @$summary_file (if exists).
  2. $project_clause
  3. Do your job. Note: your presence (running/idle) is managed by the dispatcher — do not call POST /agents or change your agent status.
  4. Finally, save a new short and concise context summary to $summary_file for next run. Use the format in @SUMMARY_FORMAT.md ." \
  --dangerously-skip-permissions \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --model "$model" \
  --effort "$effort"
