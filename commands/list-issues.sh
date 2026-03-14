#!/usr/bin/env bash
set -euo pipefail

[[ $# -lt 1 ]] && { echo "Usage: $0 <projectname>"; exit 1; }

REPO="agentine/$1"
gh repo view "$REPO" --json name &>/dev/null || { echo "No repo: $REPO"; exit 0; }

OUTPUT=$(gh issue list --repo "$REPO" --state open --limit 50 \
  --json number,title,labels,updatedAt,author,comments \
  --template '{{range .}}#{{.number}} [{{timeago .updatedAt}}] "{{.title}}" by:{{.author.login}} comments:{{len .comments}}{{range .labels}} [{{.name}}]{{end}}
{{end}}')

if [[ -z "$OUTPUT" ]]; then
  echo "No open issues: $REPO"
else
  echo "=== Open Issues: $REPO ==="
  printf '%s' "$OUTPUT"
fi
