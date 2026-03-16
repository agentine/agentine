---
name: check-name
description: Check if a package name is available on PyPI, npm, or pkg.go.dev
---

Check package name availability.

Arguments: $ARGUMENTS
- $0: package name
- $1: language (python, go, or node). If omitted, check all three registries.

Use the `check_package_name` MCP tool. If no language is specified, check all three registries and report results for each.
