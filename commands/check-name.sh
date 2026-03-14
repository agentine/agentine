#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <name> <language>"
  echo "  language: python | go | node"
  exit 1
}

[[ $# -lt 2 ]] && usage

NAME="$1"
LANGUAGE="$2"

case "$LANGUAGE" in
  python)
    echo "Checking PyPI for: $NAME"
    if pip index versions "$NAME" 2>/dev/null | grep -q "$NAME"; then
      echo "TAKEN — $NAME exists on PyPI"
    else
      echo "AVAILABLE — $NAME is not on PyPI"
    fi
    ;;

  node)
    echo "Checking npm for: @agentine/$NAME"
    if npm view "@agentine/$NAME" version 2>/dev/null; then
      echo "TAKEN — @agentine/$NAME exists on npm"
    else
      echo "AVAILABLE — @agentine/$NAME is not on npm"
    fi
    ;;

  go)
    echo "Checking pkg.go.dev for: github.com/agentine/$NAME"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://pkg.go.dev/github.com/agentine/$NAME")
    if [[ "$STATUS" == "200" ]]; then
      echo "TAKEN — github.com/agentine/$NAME exists on pkg.go.dev"
    else
      echo "AVAILABLE — github.com/agentine/$NAME is not on pkg.go.dev"
    fi
    ;;

  *)
    echo "Error: language must be python, go, or node"
    exit 1
    ;;
esac
