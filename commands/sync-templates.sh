#!/bin/sh
# Detect template drift across projects.
# Usage: commands/sync-templates.sh [projectname]
# If no project given, checks all projects.

detect_language() {
  _dir="$1"
  if [ -f "$_dir/pyproject.toml" ]; then
    echo "python"
  elif [ -f "$_dir/package.json" ]; then
    echo "node"
  elif [ -f "$_dir/go.mod" ]; then
    echo "go"
  else
    echo ""
  fi
}

check_project() {
  _project="$1"
  _dir="projects/$_project"
  _lang=$(detect_language "$_dir")

  if [ -z "$_lang" ]; then
    return
  fi

  _drifted=0
  for f in Makefile .github/workflows/ci.yml .github/workflows/publish.yml .github/dependabot.yml; do
    _template="templates/$_lang/$f"
    _target="$_dir/$f"

    if [ -f "$_template" ] && [ -f "$_target" ]; then
      if ! diff -q "$_template" "$_target" >/dev/null 2>&1; then
        if [ $_drifted -eq 0 ]; then
          echo "[$_project] ($_lang)"
          _drifted=1
        fi
        echo "  DRIFT: $f"
      fi
    fi
  done
}

if [ -n "$1" ]; then
  check_project "$1"
else
  for dir in projects/*/; do
    name=$(basename "$dir")
    # Skip agent-comms (internal project)
    [ "$name" = "agent-comms" ] && continue
    check_project "$name"
  done
fi
