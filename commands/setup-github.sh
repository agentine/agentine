#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <projectname>"
  exit 1
}

[[ $# -lt 1 ]] && usage

PROJECTNAME="$1"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$REPO_ROOT/projects/$PROJECTNAME"

if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "Error: project directory not found: $PROJECT_DIR"
  exit 1
fi

cd "$PROJECT_DIR"

# Check if remote already exists
if git remote get-url origin &>/dev/null; then
  echo "Remote 'origin' already exists: $(git remote get-url origin)"
  echo "Pushing to existing remote..."
  git push -u origin main
else
  echo "Creating GitHub repository: agentine/$PROJECTNAME"
  gh repo create "agentine/$PROJECTNAME" --public --source=. --push
fi

echo "GitHub repository ready: https://github.com/agentine/$PROJECTNAME"
