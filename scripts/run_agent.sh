#!/bin/sh

name="$1"
model="$2"

if [ -z "$name" ]; then
  echo "usage: $0 <NAME> [model-name]"
  exit 1
fi

if [ -z "$model" ]; then
  model="claude-opus-4-6"
fi

session_id=$(cat "cache/$name.session_id" 2>/dev/null || echo "unset")
mode_flag=""

if [ "$session_id" = "unset" ]; then
  session_id=$(uuidgen)
  # mode_flag="--session-id=$session_id"
  needs_save=true
else
  # mode_flag="--resume $session_id"
  needs_save=false
fi

echo "run: $name -> $model -> $session_id"

claude -p "0. Read @org-roles/$name.md .\
  1. Read previous context summary at @cache/$name.summary (if exists).\
  2. Do your job.\
  3. Finally, save a new context summary to cache/$name.summary for picking up later." \
  --dangerously-skip-permissions \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --model "$model" \
  $mode_flag

if [ "$needs_save" = "true" ] && [ $? -eq 0 ]; then
  printf "%s" "$session_id" >"cache/$name.session_id"
fi
