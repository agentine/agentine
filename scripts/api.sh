#!/bin/sh
# API wrapper — ensures agents always hit the correct API endpoint.
# Usage: scripts/api.sh <METHOD> <path> [json-body]
# Examples:
#   scripts/api.sh GET /tasks?username=developer&status=pending
#   scripts/api.sh POST /tasks '{"username":"developer","project":"foo","title":"do thing","status":"pending","priority":3}'
#   scripts/api.sh PATCH /tasks/42 '{"status":"done"}'

set -e

if [ -z "$API_URL" ] || [ -z "$API_KEY" ]; then
  echo "error: API_URL and API_KEY must be set in environment" >&2
  exit 1
fi

method="$1"
path="$2"
body="$3"

if [ -z "$method" ] || [ -z "$path" ]; then
  echo "usage: scripts/api.sh <METHOD> <path> [json-body]" >&2
  exit 1
fi

url="${API_URL}${path}"

if [ -n "$body" ]; then
  exec curl -s -X "$method" "$url" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$body"
else
  exec curl -s -X "$method" "$url" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json"
fi
