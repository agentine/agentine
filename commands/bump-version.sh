#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <projectname> <version>"
  exit 1
}

[[ $# -lt 2 ]] && usage

PROJECTNAME="$1"
VERSION="$2"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$REPO_ROOT/projects/$PROJECTNAME"

if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "Error: project directory not found: $PROJECT_DIR"
  exit 1
fi

cd "$PROJECT_DIR"

# Auto-detect language from manifest files
if [[ -f "pyproject.toml" ]]; then
  echo "Detected Python project"
  ESC_VERSION=$(printf '%s\n' "$VERSION" | sed 's/[&/\]/\\&/g')
  sed -i.bak "s/^version = \".*\"/version = \"$ESC_VERSION\"/" pyproject.toml
  rm -f pyproject.toml.bak
  echo "Updated pyproject.toml to version $VERSION"

elif [[ -f "package.json" ]]; then
  echo "Detected Node project"
  # Use node to update version to avoid sed issues with JSON
  NEW_VERSION="$VERSION" node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = process.env.NEW_VERSION;
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  echo "Updated package.json to version $VERSION"

elif [[ -f "go.mod" ]]; then
  echo "Detected Go project"
  echo "Go versions are managed via git tags — no manifest update needed."
  echo "Tag with: git tag v$VERSION"

else
  echo "Error: no recognized manifest file found (pyproject.toml, package.json, go.mod)"
  exit 1
fi
