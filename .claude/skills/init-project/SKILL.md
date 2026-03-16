---
name: init-project
description: Scaffold a new agentine project from a language template (python, go, or node) and create its GitHub repo
---

Initialize a new agentine project.

Arguments: $ARGUMENTS
- $0: project name
- $1: language (python, go, or node)
- $2: description (quoted string)

Steps:
1. Use the `check_package_name` MCP tool to verify the name is available on the target registry
2. Use the `init_project` MCP tool to scaffold the project
3. Use the `setup_github` MCP tool to create the GitHub repository
4. Use the `create_project` MCP tool to register it in the coordination API with status "proposed"
