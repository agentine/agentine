#!/bin/sh

name="$1"
model="$2"
effort="$3"

if [ -z "$name" ] || [ -z $model ] || [ -z $effort ]; then
  echo "usage: $0 <NAME> <model-name> <effort low|medium|high|max>"
  exit 1
fi

if [ -z "$model" ]; then
  model="claude-opus-4-6"
fi

# session_id=$(cat "cache/$name.session_id" 2>/dev/null || echo "unset")
# mode_flag=""
#
# if [ "$session_id" = "unset" ]; then
#   session_id=$(uuidgen)
#   # mode_flag="--session-id=$session_id"
#   needs_save=true
# else
#   # mode_flag="--resume $session_id"
#   needs_save=false
# fi

if [ -f .env ]; then
  . ./.env
fi

echo "run: name=$name model=$model e:$effort"

claude -p "0. Read @org-roles/$name.md .\
  1. Read previous context summary at @cache/$name.summary (if exists).\
  2. Do your job.\
  3. Finally, save a new short and concise context summary to cache/$name.summary for next run." \
  --dangerously-skip-permissions \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --model "$model" \
  --effort "$effort"
# $mode_flag

# if [ "$needs_save" = "true" ] && [ $? -eq 0 ]; then
#   printf "%s" "$session_id" >"cache/$name.session_id"
# fi
