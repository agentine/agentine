#!/usr/bin/env bash
set -euo pipefail

[[ $# -lt 1 ]] && { echo "Usage: $0 <projectname>"; exit 1; }

REPO="agentine/$1"
gh repo view "$REPO" --json name &>/dev/null || { echo "No repo: $REPO"; exit 0; }

OUTPUT=$(gh pr list --repo "$REPO" --state open --limit 50 \
  --json number,title,updatedAt,author,reviewDecision,mergeable,isDraft,additions,deletions \
  --template '{{range .}}#{{.number}} [{{timeago .updatedAt}}] "{{.title}}" by:{{.author.login}} +{{.additions}}/-{{.deletions}} mergeable:{{.mergeable}} review:{{.reviewDecision}}{{if .isDraft}} DRAFT{{end}}
{{end}}')

if [[ -z "$OUTPUT" ]]; then
  echo "No open PRs: $REPO"
else
  echo "=== Open PRs: $REPO ==="
  printf '%s' "$OUTPUT"
fi
