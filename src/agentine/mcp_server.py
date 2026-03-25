#!/usr/bin/env python3
"""Agentine MCP server — exposes agent-comms API and project commands as tools."""

import datetime
import json
import re
import subprocess
from pathlib import Path

import requests
from mcp.server.fastmcp import FastMCP

from agentine.config import (
    API_PREFIX,
    API_URL,
    HEADERS,
    PROJECTS_DIR,
    TEMPLATES_DIR,
)
from agentine.log import setup_logging

mcp = FastMCP("agentine")
log = setup_logging("mcp")


def _api(method: str, path: str, **kwargs) -> dict:
    """Make an API request and return the JSON response."""
    log.debug(f"API {method} {path}")
    try:
        resp = requests.request(
            method, f"{API_URL}{API_PREFIX}{path}", headers=HEADERS, timeout=30, **kwargs
        )
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        log.error(f"API {method} {path} — {e}")
        return {"error": str(e)}


def _gh(*args: str, cwd: str | Path | None = None) -> str:
    """Run a gh CLI command and return output."""
    log.debug(f"gh {' '.join(args[:4])}")
    result = subprocess.run(
        ["gh", *args],
        capture_output=True,
        text=True,
        cwd=cwd,
        timeout=60,
    )
    output = result.stdout.strip()
    if result.returncode != 0:
        err = result.stderr.strip()
        if err:
            output = f"{output}\n{err}".strip() if output else err
        output += f"\n[exit code: {result.returncode}]"
        log.warning(f"gh {' '.join(args[:4])} → exit {result.returncode}")
    return output


def _git(*args: str, cwd: str | Path | None = None) -> subprocess.CompletedProcess:
    """Run a git command."""
    log.debug(f"git {' '.join(args)}")
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, cwd=cwd, timeout=60
    )


def _detect_language(project_dir: Path) -> str:
    """Detect project language from manifest files."""
    if (project_dir / "pyproject.toml").exists():
        return "python"
    if (project_dir / "package.json").exists():
        return "node"
    if (project_dir / "go.mod").exists():
        return "go"
    return ""


# ── Task Tools ──


@mcp.tool()
def list_tasks(
    username: str = "",
    status: str = "",
    project: str = "",
    limit: int = 50,
    offset: int = 0,
) -> str:
    """List tasks from the agent coordination API.

    Filter by username, status (pending/in_progress/blocked/done/cancelled),
    and/or project. Returns highest priority first.
    """
    params = f"limit={limit}&offset={offset}"
    if username:
        params += f"&username={username}"
    if status:
        params += f"&status={status}"
    if project:
        params += f"&project={project}"
    return json.dumps(_api("GET", f"/tasks?{params}"), indent=2)


@mcp.tool()
def get_task(task_id: int) -> str:
    """Get a specific task by ID."""
    return json.dumps(_api("GET", f"/tasks/{task_id}"), indent=2)


@mcp.tool()
def create_task(
    username: str,
    title: str,
    status: str = "pending",
    project: str = "",
    description: str = "",
    priority: int = 3,
) -> str:
    """Create a new task assigned to an agent.

    Status: pending, in_progress, blocked, done, cancelled.
    Priority: 1 (lowest) to 5 (highest).
    """
    log.info(f"create_task: {username} '{title}' project={project or '<none>'}")
    payload: dict = {
        "username": username,
        "title": title,
        "status": status,
        "priority": priority,
    }
    if project:
        payload["project"] = project
    if description:
        payload["description"] = description
    return json.dumps(_api("POST", "/tasks", json=payload), indent=2)


@mcp.tool()
def update_task(
    task_id: int,
    status: str = "",
    blocked_reason: str = "",
    blocked_at: str = "",
) -> str:
    """Update a task's status.

    When blocking, include blocked_reason and blocked_at (ISO 8601 timestamp).
    Lifecycle: pending -> in_progress -> done (or in_progress -> blocked -> in_progress -> done).
    """
    log.info(f"update_task: #{task_id} status={status or '<unchanged>'}")
    payload: dict = {}
    if status:
        payload["status"] = status
    if blocked_reason:
        payload["blocked_reason"] = blocked_reason
    if blocked_at:
        payload["blocked_at"] = blocked_at
    if not payload:
        return json.dumps({"error": "no fields to update"})
    return json.dumps(_api("PATCH", f"/tasks/{task_id}", json=payload), indent=2)


# ── Journal Tools ──


@mcp.tool()
def list_journal(
    username: str = "",
    project: str = "",
    limit: int = 50,
    offset: int = 0,
) -> str:
    """List journal entries (shared memory between agents). Returns newest first."""
    params = f"limit={limit}&offset={offset}"
    if username:
        params += f"&username={username}"
    if project:
        params += f"&project={project}"
    return json.dumps(_api("GET", f"/journal?{params}"), indent=2)


@mcp.tool()
def create_journal(username: str, content: str, project: str = "") -> str:
    """Write a journal entry. The journal is shared memory between all agents."""
    log.info(f"create_journal: {username} project={project or '<none>'}")
    payload: dict = {"username": username, "content": content}
    if project:
        payload["project"] = project
    return json.dumps(_api("POST", "/journal", json=payload), indent=2)


# ── Project Tools ──


@mcp.tool()
def list_projects(status: str = "", limit: int = 100) -> str:
    """List projects. Filter by status: proposed, planning, development, testing, documentation, published, cancelled."""
    params = f"limit={limit}"
    if status:
        params += f"&status={status}"
    return json.dumps(_api("GET", f"/projects?{params}"), indent=2)


@mcp.tool()
def get_project(name: str) -> str:
    """Get a specific project by name."""
    return json.dumps(_api("GET", f"/projects/{name}"), indent=2)


@mcp.tool()
def create_project(
    name: str, language: str, description: str = "", status: str = "proposed"
) -> str:
    """Create a new project in the coordination API.

    Language must be: python, go, node, or rust.
    """
    log.info(f"create_project: {name} ({language})")
    payload: dict = {"name": name, "language": language, "status": status}
    if description:
        payload["description"] = description
    return json.dumps(_api("POST", "/projects", json=payload), indent=2)


@mcp.tool()
def update_project(name: str, status: str) -> str:
    """Update a project's status."""
    log.info(f"update_project: {name} → {status}")
    return json.dumps(
        _api("PATCH", f"/projects/{name}", json={"status": status}), indent=2
    )


# ── Status & Presence Tools ──


@mcp.tool()
def get_status() -> str:
    """Get aggregate system status: running agents, active projects, task summary counts."""
    return json.dumps(_api("GET", "/status"), indent=2)


@mcp.tool()
def list_agents(status: str = "") -> str:
    """List agent presence. Filter by status: running, idle."""
    path = "/agents"
    if status:
        path += f"?status={status}"
    return json.dumps(_api("GET", path), indent=2)


# ── Project Command Tools ──


@mcp.tool()
def check_package_name(name: str, language: str) -> str:
    """Check if a package name is available on the registry (PyPI, npm, or pkg.go.dev).

    Language must be: python, go, or node.
    """
    if language == "python":
        try:
            resp = requests.get(f"https://pypi.org/pypi/{name}/json", timeout=15)
            if resp.status_code == 200:
                return f"TAKEN — {name} exists on PyPI"
            return f"AVAILABLE — {name} is not on PyPI"
        except requests.RequestException as e:
            return f"ERROR checking PyPI: {e}"

    elif language == "node":
        try:
            resp = requests.get(
                f"https://registry.npmjs.org/@agentine/{name}", timeout=15
            )
            if resp.status_code == 200:
                return f"TAKEN — @agentine/{name} exists on npm"
            return f"AVAILABLE — @agentine/{name} is not on npm"
        except requests.RequestException as e:
            return f"ERROR checking npm: {e}"

    elif language == "go":
        try:
            resp = requests.get(
                f"https://pkg.go.dev/github.com/agentine/{name}", timeout=15
            )
            if resp.status_code == 200:
                return f"TAKEN — github.com/agentine/{name} exists on pkg.go.dev"
            return f"AVAILABLE — github.com/agentine/{name} is not on pkg.go.dev"
        except requests.RequestException as e:
            return f"ERROR checking pkg.go.dev: {e}"

    else:
        return f"ERROR: language must be python, go, or node (got: {language})"


@mcp.tool()
def list_issues(project: str) -> str:
    """List open GitHub issues for an agentine project."""
    repo = f"agentine/{project}"
    check = _gh("repo", "view", repo, "--json", "name")
    if "exit code" in check:
        return f"No repo: {repo}"

    output = _gh(
        "issue",
        "list",
        "--repo",
        repo,
        "--state",
        "open",
        "--limit",
        "50",
        "--json",
        "number,title,labels,updatedAt,author,comments",
        "--template",
        '{{range .}}#{{.number}} [{{timeago .updatedAt}}] "{{.title}}" by:{{.author.login}} comments:{{len .comments}}{{range .labels}} [{{.name}}]{{end}}\n{{end}}',
    )
    return output if output else f"No open issues: {repo}"


@mcp.tool()
def list_prs(project: str) -> str:
    """List open GitHub pull requests for an agentine project."""
    repo = f"agentine/{project}"
    check = _gh("repo", "view", repo, "--json", "name")
    if "exit code" in check:
        return f"No repo: {repo}"

    output = _gh(
        "pr",
        "list",
        "--repo",
        repo,
        "--state",
        "open",
        "--limit",
        "50",
        "--json",
        "number,title,updatedAt,author,reviewDecision,mergeable,isDraft,additions,deletions",
        "--template",
        '{{range .}}#{{.number}} [{{timeago .updatedAt}}] "{{.title}}" by:{{.author.login}} +{{.additions}}/-{{.deletions}} mergeable:{{.mergeable}} review:{{.reviewDecision}}{{if .isDraft}} DRAFT{{end}}\n{{end}}',
    )
    return output if output else f"No open PRs: {repo}"


@mcp.tool()
def comment_issue(project: str, number: int, body: str) -> str:
    """Add a comment to a GitHub issue on an agentine project."""
    log.info(f"comment_issue: {project}#{number}")
    repo = f"agentine/{project}"
    return _gh("issue", "comment", str(number), "--repo", repo, "--body", body)


@mcp.tool()
def close_issue(project: str, number: int, comment: str = "") -> str:
    """Close a GitHub issue on an agentine project, optionally with a closing comment."""
    log.info(f"close_issue: {project}#{number}")
    repo = f"agentine/{project}"
    args = ["issue", "close", str(number), "--repo", repo]
    if comment:
        args += ["--comment", comment]
    return _gh(*args)


@mcp.tool()
def merge_pr(project: str, number: int, strategy: str = "squash") -> str:
    """Merge a GitHub pull request on an agentine project.

    Strategy: squash (default), merge, or rebase.
    """
    log.info(f"merge_pr: {project}#{number} ({strategy})")
    repo = f"agentine/{project}"
    return _gh("pr", "merge", str(number), f"--{strategy}", "--repo", repo)


@mcp.tool()
def review_pr(
    project: str, number: int, action: str = "comment", body: str = ""
) -> str:
    """Review a GitHub pull request on an agentine project.

    Action: approve, request-changes, or comment.
    """
    log.info(f"review_pr: {project}#{number} ({action})")
    repo = f"agentine/{project}"
    args = ["pr", "review", str(number), "--repo", repo, f"--{action}"]
    if body:
        args += ["--body", body]
    return _gh(*args)


@mcp.tool()
def close_pr(project: str, number: int, comment: str = "") -> str:
    """Close a GitHub pull request on an agentine project, optionally with a comment."""
    log.info(f"close_pr: {project}#{number}")
    repo = f"agentine/{project}"
    args = ["pr", "close", str(number), "--repo", repo]
    if comment:
        args += ["--comment", comment]
    return _gh(*args)


@mcp.tool()
def create_release(
    project: str, version: str, generate_notes: bool = True, body: str = ""
) -> str:
    """Create a GitHub release for an agentine project.

    This triggers CI to publish to package registries — do not publish directly.
    Version should include the 'v' prefix (e.g. 'v0.1.0').
    """
    log.info(f"create_release: {project} {version}")
    repo = f"agentine/{project}"
    args = ["release", "create", version, "--repo", repo]
    if generate_notes:
        args.append("--generate-notes")
    if body:
        args += ["--notes", body]
    return _gh(*args)


@mcp.tool()
def list_ci_runs(project: str, limit: int = 10) -> str:
    """List recent CI workflow runs for an agentine project."""
    repo = f"agentine/{project}"
    return _gh("run", "list", "--repo", repo, "--limit", str(limit))


@mcp.tool()
def update_repo_description(project: str, description: str) -> str:
    """Update the GitHub repository description for an agentine project."""
    log.info(f"update_repo_description: {project}")
    repo = f"agentine/{project}"
    return _gh("repo", "edit", repo, "--description", description)


@mcp.tool()
def rename_repo(project: str, new_name: str) -> str:
    """Rename a GitHub repository under the agentine org.

    Also updates the local git remote URL to match.
    """
    log.info(f"rename_repo: {project} → {new_name}")
    project_dir = PROJECTS_DIR / project
    output = _gh("repo", "rename", new_name, "--repo", f"agentine/{project}", "--yes")
    if "exit code" not in output and project_dir.is_dir():
        subprocess.run(
            ["git", "remote", "set-url", "origin", f"https://github.com/agentine/{new_name}.git"],
            capture_output=True,
            text=True,
            cwd=project_dir,
        )
        output += f"\nRemote URL updated to agentine/{new_name}"
    return output


@mcp.tool()
def get_pr_diff(project: str, number: int) -> str:
    """Get the diff of a GitHub pull request on an agentine project."""
    repo = f"agentine/{project}"
    return _gh("pr", "diff", str(number), "--repo", repo)


@mcp.tool()
def get_pr_checks(project: str, number: int) -> str:
    """Get CI check status for a GitHub pull request on an agentine project."""
    repo = f"agentine/{project}"
    return _gh("pr", "checks", str(number), "--repo", repo)


@mcp.tool()
def init_project(name: str, language: str, description: str) -> str:
    """Scaffold a new agentine project from a language template.

    Language must be: python, go, or node.
    Creates project directory, git repo, CI workflows, and initial commit.
    """
    log.info(f"init_project: {name} ({language})")
    if language not in ("python", "go", "node"):
        return f"ERROR: language must be python, go, or node (got: {language})"

    template_dir = TEMPLATES_DIR / language
    project_dir = PROJECTS_DIR / name

    if not template_dir.is_dir():
        return f"ERROR: template directory not found: {template_dir}"
    if project_dir.exists():
        return f"ERROR: project directory already exists: {project_dir}"

    project_dir.mkdir(parents=True)

    def copy_template(src: Path, dest: Path):
        dest.parent.mkdir(parents=True, exist_ok=True)
        content = src.read_text()
        content = content.replace("{{projectname}}", name)
        content = content.replace("{{description}}", description)
        dest.write_text(content)

    # Copy .gitignore and Makefile
    copy_template(template_dir / "gitignore", project_dir / ".gitignore")
    copy_template(template_dir / "Makefile", project_dir / "Makefile")

    # Copy CI workflows
    (project_dir / ".github" / "workflows").mkdir(parents=True, exist_ok=True)
    copy_template(
        template_dir / "ci.yml", project_dir / ".github" / "workflows" / "ci.yml"
    )
    copy_template(
        template_dir / "publish.yml",
        project_dir / ".github" / "workflows" / "publish.yml",
    )
    copy_template(
        template_dir / "dependabot.yml", project_dir / ".github" / "dependabot.yml"
    )

    # Language-specific setup
    if language == "python":
        copy_template(template_dir / "pyproject.toml", project_dir / "pyproject.toml")
        src_dir = project_dir / "src" / name
        src_dir.mkdir(parents=True)
        (src_dir / "__init__.py").write_text(f'"""{description}"""\n')
        tests_dir = project_dir / "tests"
        tests_dir.mkdir()
        (tests_dir / "__init__.py").touch()

    elif language == "go":
        (project_dir / "go.mod").write_text(
            f"module github.com/agentine/{name}\n\ngo 1.23\n"
        )
        (project_dir / f"{name}.go").write_text(
            f"// Package {name} — {description}\npackage {name}\n"
        )

    elif language == "node":
        copy_template(template_dir / "package.json", project_dir / "package.json")
        copy_template(template_dir / "tsconfig.json", project_dir / "tsconfig.json")
        copy_template(
            template_dir / "tsconfig.cjs.json", project_dir / "tsconfig.cjs.json"
        )
        (project_dir / "src").mkdir()
        (project_dir / "tests").mkdir()
        (project_dir / "src" / "index.ts").write_text(f"// {description}\nexport {{}};\n")

    # Common files
    (project_dir / "README.md").write_text(f"# {name}\n\n{description}\n")
    (project_dir / "CHANGELOG.md").write_text(
        "# Changelog\n\n## 0.1.0\n\n- Initial release\n"
    )
    year = datetime.date.today().year
    (project_dir / "LICENSE").write_text(
        f"""MIT License

Copyright (c) {year} Agentine

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
"""
    )

    # Git init and commit
    _git("init", cwd=project_dir)
    _git("add", "-A", cwd=project_dir)
    _git("commit", "-m", f"initial scaffold from template ({language})", cwd=project_dir)

    log.info(f"init_project: {name} scaffolded successfully")
    return (
        f"Project scaffolded: {project_dir}\n"
        f"Language: {language}\n"
        f"Next: use setup_github tool to create the GitHub repo"
    )


@mcp.tool()
def bump_version(project: str, version: str) -> str:
    """Bump the version of an agentine project.

    Auto-detects language from manifest (pyproject.toml, package.json, go.mod).
    """
    log.info(f"bump_version: {project} → {version}")
    project_dir = PROJECTS_DIR / project
    if not project_dir.is_dir():
        return f"ERROR: project directory not found: {project_dir}"

    language = _detect_language(project_dir)
    if not language:
        return "ERROR: no recognized manifest file found (pyproject.toml, package.json, go.mod)"

    if language == "python":
        toml_path = project_dir / "pyproject.toml"
        content = toml_path.read_text()
        new_content = re.sub(
            r'^version = ".*"', f'version = "{version}"', content, flags=re.MULTILINE
        )
        toml_path.write_text(new_content)
        return f"Detected Python project\nUpdated pyproject.toml to version {version}"

    elif language == "node":
        pkg_path = project_dir / "package.json"
        pkg = json.loads(pkg_path.read_text())
        pkg["version"] = version
        pkg_path.write_text(json.dumps(pkg, indent=2) + "\n")
        return f"Detected Node project\nUpdated package.json to version {version}"

    elif language == "go":
        return (
            f"Detected Go project\n"
            f"Go versions are managed via git tags — no manifest update needed.\n"
            f"Tag with: git tag v{version}"
        )

    return "ERROR: unexpected language"


@mcp.tool()
def setup_github(project: str) -> str:
    """Create a GitHub repository under agentine org and push initial commit."""
    log.info(f"setup_github: {project}")
    project_dir = PROJECTS_DIR / project
    if not project_dir.is_dir():
        return f"ERROR: project directory not found: {project_dir}"

    # Check if remote already exists
    result = _git("remote", "get-url", "origin", cwd=project_dir)
    if result.returncode == 0:
        remote_url = result.stdout.strip()
        _git("push", "-u", "origin", "main", cwd=project_dir)
        return f"Remote 'origin' already exists: {remote_url}\nPushed to existing remote.\nGitHub repository ready: https://github.com/agentine/{project}"

    output = _gh(
        "repo",
        "create",
        f"agentine/{project}",
        "--public",
        "--source=.",
        "--push",
        cwd=project_dir,
    )
    return f"{output}\nGitHub repository ready: https://github.com/agentine/{project}"


@mcp.tool()
def sync_templates(project: str = "") -> str:
    """Detect template drift in project files vs. language templates.

    If no project given, checks all projects.
    """
    check_files = [
        "Makefile",
        ".github/workflows/ci.yml",
        ".github/workflows/publish.yml",
        ".github/dependabot.yml",
    ]
    results = []

    def check_project(name: str):
        project_dir = PROJECTS_DIR / name
        language = _detect_language(project_dir)
        if not language:
            return

        drifted = []
        for f in check_files:
            template_file = TEMPLATES_DIR / language / f
            target_file = project_dir / f
            if template_file.exists() and target_file.exists():
                # Render template variables before comparing
                rendered = template_file.read_text()
                rendered = rendered.replace("{{projectname}}", name)
                rendered = rendered.replace("{{description}}", "")
                if rendered != target_file.read_text():
                    drifted.append(f)

        if drifted:
            results.append(f"[{name}] ({language})")
            for f in drifted:
                results.append(f"  DRIFT: {f}")

    if project:
        check_project(project)
    else:
        for d in sorted(PROJECTS_DIR.iterdir()):
            if d.is_dir() and d.name != "agent-comms":
                check_project(d.name)

    return "\n".join(results) if results else "No template drift detected."


if __name__ == "__main__":
    mcp.run()
