#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <projectname> <language> \"<description>\""
  echo "  language: python | go | node"
  exit 1
}

[[ $# -lt 3 ]] && usage

PROJECTNAME="$1"
LANGUAGE="$2"
DESCRIPTION="$3"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
TEMPLATE_DIR="$REPO_ROOT/templates/$LANGUAGE"
PROJECT_DIR="$REPO_ROOT/projects/$PROJECTNAME"

# Validate language
case "$LANGUAGE" in
  python|go|node) ;;
  *) echo "Error: language must be python, go, or node"; exit 1 ;;
esac

# Validate template directory exists
if [[ ! -d "$TEMPLATE_DIR" ]]; then
  echo "Error: template directory not found: $TEMPLATE_DIR"
  exit 1
fi

# Create project directory
if [[ -d "$PROJECT_DIR" ]]; then
  echo "Error: project directory already exists: $PROJECT_DIR"
  exit 1
fi

mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"
git init

# Helper: copy template with placeholder substitution
copy_template() {
  local src="$1"
  local dest="$2"
  mkdir -p "$(dirname "$dest")"
  # Escape sed special characters in replacement strings
  local esc_name esc_desc
  esc_name=$(printf '%s\n' "$PROJECTNAME" | sed 's/[&/\]/\\&/g')
  esc_desc=$(printf '%s\n' "$DESCRIPTION" | sed 's/[&/\]/\\&/g')
  sed -e "s/{{projectname}}/$esc_name/g" \
      -e "s/{{description}}/$esc_desc/g" \
      "$src" > "$dest"
}

# Copy .gitignore
copy_template "$TEMPLATE_DIR/gitignore" ".gitignore"

# Copy Makefile
copy_template "$TEMPLATE_DIR/Makefile" "Makefile"

# Copy CI workflows
mkdir -p .github/workflows
copy_template "$TEMPLATE_DIR/ci.yml" ".github/workflows/ci.yml"
copy_template "$TEMPLATE_DIR/publish.yml" ".github/workflows/publish.yml"
copy_template "$TEMPLATE_DIR/dependabot.yml" ".github/dependabot.yml"

# Language-specific setup
case "$LANGUAGE" in
  python)
    copy_template "$TEMPLATE_DIR/pyproject.toml" "pyproject.toml"
    mkdir -p "src/$PROJECTNAME"
    cat > "src/$PROJECTNAME/__init__.py" <<EOF
"""$DESCRIPTION"""
EOF
    mkdir -p tests
    touch tests/__init__.py
    ;;

  go)
    cat > "go.mod" <<EOF
module github.com/agentine/$PROJECTNAME

go 1.23
EOF
    cat > "${PROJECTNAME}.go" <<EOF
// Package $PROJECTNAME — $DESCRIPTION
package $PROJECTNAME
EOF
    ;;

  node)
    copy_template "$TEMPLATE_DIR/package.json" "package.json"
    copy_template "$TEMPLATE_DIR/tsconfig.json" "tsconfig.json"
    copy_template "$TEMPLATE_DIR/tsconfig.cjs.json" "tsconfig.cjs.json"
    mkdir -p src tests
    cat > "src/index.ts" <<EOF
// $DESCRIPTION
export {};
EOF
    ;;
esac

# Create common files
cat > "README.md" <<EOF
# $PROJECTNAME

$DESCRIPTION
EOF

cat > "CHANGELOG.md" <<EOF
# Changelog

## 0.1.0

- Initial release
EOF

YEAR=$(date +%Y)
cat > "LICENSE" <<LICEOF
MIT License

Copyright (c) $YEAR Agentine

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
LICEOF

# Initial commit
git add -A
git commit -m "initial scaffold from template ($LANGUAGE)"

echo ""
echo "Project scaffolded: $PROJECT_DIR"
echo "Language: $LANGUAGE"
echo "Next: cd $PROJECT_DIR && ../../commands/setup-github.sh $PROJECTNAME"
