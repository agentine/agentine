#!/bin/bash

# export IS_SANDBOX=1

name=$1
model=$2

if [[ $name == "" ]]; then
  echo "usage: $0 <NAME> [model-name]"
  exit 1
fi

if [[ $model == "" ]]; then
  # default model fallback
  model="claude-opus-4-6"
fi
session_id=$(cat cache/$name.session_id 2>/dev/null || echo "unset")

if [[ "$session_id" == "unset" ]]; then
  session_id=$(uuidgen)
  echo "RUN: $name -> $model -> $session_id"
  claude -p "read @org-roles/$name.md and do your job." --dangerously-skip-permissions --output-format stream-json \
    --verbose \
    --include-partial-messages \
    --model $model \
    --session-id=$session_id
  # must save at end otherwise we could error thinking the session was created previously
  echo "$session_id" >cache/$name.session_id
else
  echo "RUN: $name -> $model -> $session_id"
  claude -p "read @org-roles/$name.md and do your job." --dangerously-skip-permissions --output-format stream-json \
    --verbose \
    --include-partial-messages \
    --model $model \
    --resume $session_id
fi
