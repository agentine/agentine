#!/bin/sh

allow_architect="$1"

if [ "$1" = "-h" ] || [ "$1" = "--help" ] || [ "$1" = "help" ] || [ -z "$1" ]; then
  echo "usage: $0 <run-architect (yes/no)>"
  echo "example: $0 yes"
  exit 1
fi

# efforts: low, medium, high, max
# POSIX-friendly
agents_flow="
ARCHITECT|claude-opus-4-6|high
PROJECT_MANAGER|claude-sonnet-4-6|medium
DEVELOPER|claude-opus-4-6|max
QA|claude-opus-4-6|max
DOCUMENTATION_WRITER|claude-sonnet-4-6|medium
RELEASE_MANAGER|claude-sonnet-4-6|high
"

echo "starting agent loop... allow_architect=$allow_architect"

run_with_retry() {
  _script_path="$1"
  _name="$2"
  _model="$3"
  _effort="$4"

  attempt=1
  max_backoff=1800
  backoff=600

  while :; do
    echo "running '$_script_path $_name $_model $_effort' (attempt $attempt)..."
    "$_script_path" "$_name" "$_model" "$_effort"
    status=$?

    if [ $status -eq 0 ]; then
      echo "SUCCESS: commit cache/$_name.summary file. taking a 60s break."
      git add cache/*summary 2>/dev/null || :
      git commit -m "run_agent: commit $_name summary cache" 2>/dev/null || :
      sleep 60
      return 0
    fi

    echo "------------------------------------"
    echo "ERROR: failed with exit code $status"
    echo "       retrying in $backoff seconds "
    echo "------------------------------------"
    sleep "$backoff"

    backoff=$((backoff * 2))
    [ $backoff -gt $max_backoff ] && backoff=$max_backoff
    attempt=$((attempt + 1))
  done
}

mkdir -p cache/
loop_counter=0

while :; do
  echo "------------------------------------"
  echo "iteration: $loop_counter"

  for agent_spec in $agents_flow; do
    old_ifs="$IFS"
    IFS="|"
    set -- $agent_spec
    agent="$1"
    model="$2"
    effort="$3"
    IFS="$old_ifs"

    if [ "$agent" = "ARCHITECT" ] && [ "$allow_architect" != "yes" ]; then
      echo "!! SKIP: $agent"
      continue
    fi

    echo "summoning agent: $agent -> $model -> $effort"
    run_with_retry "scripts/run_agent.sh" "$agent" "$model" "$effort"
  done

  if [ "$((loop_counter % 4))" -eq 0 ] && [ "$loop_counter" -ne 0 ]; then
    echo "long break: 30 minutes..."
    sleep 1800
  else
    echo "short break: 5 minutes..."
    sleep 300
  fi
  loop_counter=$((loop_counter + 1))
done
