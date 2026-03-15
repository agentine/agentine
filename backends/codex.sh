#!/bin/sh
name="$1"
model="$2"
effort="$3"
project="$4"

if [ -z "$name" ] || [ -z "$model" ] || [ -z "$effort" ]; then
  echo "usage: $0 <ROLE> <MODEL> <EFFORT> [PROJECT]"
  exit 2
fi

if [ -f .env ]; then
  . ./.env
fi

role_content=$(cat "org-roles/$name.md")

summary_file="cache/$name.summary"
if [ -n "$project" ]; then
  project_summary="cache/$name.$project.summary"
  if [ -f "$project_summary" ]; then
    summary_file="$project_summary"
  fi
fi
summary=$(cat "$summary_file" 2>/dev/null || echo "(no prior context)")

project_clause=""
if [ -n "$project" ]; then
  project_clause="Focus exclusively on project: $project. Only work on tasks where project=$project."
fi

echo "run: name=$name model=$model effort=$effort project=${project:-<all>}"

codex --model "$model" \
  --full-auto \
  --prompt "You are: $name

$role_content

Previous context summary:
$summary

$project_clause

Do your job. Your presence (running/idle) is managed by the dispatcher — do not call POST /agents or change your agent status.

When done, save a short context summary to $summary_file."
