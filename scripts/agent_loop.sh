#!/bin/bash

# export IS_SANDBOX=1

echo "Starting agent loop..."

run_with_retry() {
  local script="$1"
  local attempt=1
  local max_backoff=1800 # cap at 30 minutes
  local backoff=600      # initial retry delay, 5min

  while true; do
    echo "Running $script (attempt $attempt)..."
    "$script"
    status=$?

    if [ $status -eq 0 ]; then
      echo "$script completed successfully. Taking a 60s break."
      sleep 60
      return 0
    fi

    echo "$script failed with exit code $status."
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

while :; do
  echo "Summoning project manager..."
  run_with_retry scripts/project_manager.sh

  echo "Summoning developer..."
  run_with_retry scripts/developer.sh

  echo "Summoning project manager..."
  run_with_retry scripts/project_manager.sh

  echo "Summoning qa..."
  run_with_retry scripts/qa.sh

  echo "Summoning project manager..."
  run_with_retry scripts/project_manager.sh

  echo "Summoning docs writer..."
  run_with_retry scripts/documentation_writer.sh

  echo "Summoning project manager..."
  run_with_retry scripts/project_manager.sh

  echo "Summoning release manager..."
  run_with_retry scripts/release_manager.sh

  echo "Running architect..."
  run_with_retry scripts/architect.sh

  echo "Sleeping for 5 minutes"
  sleep 300
done

echo "Agent loop done."
