#!/bin/bash

# export IS_SANDBOX=1

allow_architect=$1

if [[ $1 == "-h" || $1 == "--help" || $1 == "help" ]]; then
  echo "usage: $0 <run-architect>"
  echo "examples:"
  echo "  $0 yes"
  echo "  $0 no"

  exit 1
fi

echo "Starting agent loop... allow_architect=$allow_architect"

run_with_retry() {
  local name="$2"
  local model="$3"
  local script="$1 $name $model"
  local attempt=1
  local max_backoff=1800 # cap at 30 minutes
  local backoff=600      # initial retry delay, 5min

  while true; do
    echo "Running '$script' (attempt $attempt)..."
    $script
    status=$?

    if [ $status -eq 0 ]; then
      echo "'$script' completed successfully. Taking a 60s break."
      sleep 60
      return 0
    fi

    echo "'$script' failed with exit code $status."
    echo "Backing off for $backoff seconds before retry..."

    sleep $backoff

    # exponential backoff
    backoff=$((backoff * 2))
    if [ $backoff -gt $max_backoff ]; then
      backoff=$max_backoff
    fi

    attempt=$((attempt + 1))
  done
}

mkdir -p cache/
loop_counter=0

agents_flow=(
  # 1
  "ARCHITECT claude-opus-4-6"
  "PROJECT_MANAGER claude-sonnet-4-6"
  # 2
  "DEVELOPER claude-opus-4-6"
  "PROJECT_MANAGER claude-sonnet-4-6"
  # 3
  "QA claude-opus-4-6"
  "DOCUMENTATION_WRITER claude-sonnet-4-6"
  # 4
  "PROJECT_MANAGER claude-sonnet-4-6"
  "RELEASE_MANAGER claude-sonnet-4-6"
)

while :; do
  echo "------------------------------------"
  echo "ITERATION: $loop_counter"
  echo "------------------------------------"
  for agent_spec in "${agents_flow[@]}"; do
    agent=$(echo "$agent_spec" | cut -d ' ' -f1)
    model=$(echo "$agent_spec" | cut -d ' ' -f2)

    if [[ $agent == "ARCHITECT" ]]; then
      if [[ $allow_architect != "yes" ]]; then
        echo "SKIP: $agent (allow_architect=no)"
        continue
      fi
      if ((loop_counter % 2 == 0)); then
        echo "SKIP: $agent (runs every other time)"
        continue
      fi
    fi

    echo "Summoning AGENT: $agent -> $model"
    run_with_retry scripts/run_agent.sh $agent $model
  done

  if ((loop_counter % 5 == 0)); then
    echo "------------------------------------"
    echo "!! Taking a break for 30 minutes  !!"
    echo "------------------------------------"
    sleep 1800
    echo "Break over, continuing..."
  else
    echo "------------------------------------"
    echo "5 minute break"
    echo "------------------------------------"
    sleep 300
  fi
  loop_counter=$((loop_counter + 1))
done

echo "Agent loop done."
