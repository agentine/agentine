#!/usr/bin/env python3
"""One-time script: sync tasks and project statuses from localhost:8000 to production.

The PROJECT_MANAGER accidentally used localhost:8000 instead of the production API.
This copies the developer tasks it created and fixes project statuses.
"""

import json
import os
import sys
from pathlib import Path

import requests

# Load .env
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            line = line.removeprefix("export").strip()
            if "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip("'\""))

LOCAL = "http://localhost:8000"
PROD = os.environ.get("API_URL", "https://agentine.mtingers.com")
API_KEY = os.environ["API_KEY"]
HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

DRY_RUN = "--dry-run" in sys.argv


def local_get(path):
    r = requests.get(f"{LOCAL}{path}", timeout=10)
    r.raise_for_status()
    return r.json()


def prod_get(path):
    r = requests.get(f"{PROD}{path}", headers=HEADERS, timeout=10)
    r.raise_for_status()
    return r.json()


def prod_post(path, data):
    if DRY_RUN:
        print(f"  [DRY RUN] POST {path}: {json.dumps(data)[:120]}")
        return {"id": "dry-run"}
    r = requests.post(f"{PROD}{path}", headers=HEADERS, json=data, timeout=10)
    r.raise_for_status()
    return r.json()


def prod_patch(path, data):
    if DRY_RUN:
        print(f"  [DRY RUN] PATCH {path}: {json.dumps(data)}")
        return {}
    r = requests.patch(f"{PROD}{path}", headers=HEADERS, json=data, timeout=10)
    r.raise_for_status()
    return r.json()


# --- 1. Copy developer tasks from localhost to production ---
print("=== Syncing developer tasks ===")

projects_to_sync = ["sheetcraft", "socksmith", "webenc"]
id_mapping = {}  # old_id -> new_id

for project in projects_to_sync:
    print(f"\nProject: {project}")
    local_tasks = local_get(f"/tasks?project={project}&username=developer&limit=50")

    for task in sorted(local_tasks["items"], key=lambda t: t["id"]):
        print(f"  Local task [{task['id']}]: {task['title'][:60]}")

        # Check if this task already exists on prod (by title + project)
        prod_tasks = prod_get(f"/tasks?project={project}&username=developer&limit=100")
        existing = [t for t in prod_tasks["items"] if t["title"] == task["title"]]

        if existing:
            print(f"    -> Already exists on prod as [{existing[0]['id']}], skipping")
            id_mapping[task["id"]] = existing[0]["id"]
            continue

        new_task = {
            "username": task["username"],
            "project": task["project"],
            "title": task["title"],
            "description": task["description"],
            "status": task["status"],
            "priority": task["priority"],
        }
        result = prod_post("/tasks", new_task)
        new_id = result.get("id", "?")
        id_mapping[task["id"]] = new_id
        print(f"    -> Created on prod as [{new_id}]")


# --- 2. Mark PM tasks as done (they've been processed) ---
print("\n=== Marking PM tasks as done ===")

pm_tasks_to_complete = {
    "sheetcraft": 589,
    "socksmith": 590,
    "webenc": 591,
}

for project, task_id in pm_tasks_to_complete.items():
    print(f"  Task [{task_id}] ({project} PM task) -> done")
    prod_patch(f"/tasks/{task_id}", {"status": "done"})


# --- 3. Fix project statuses ---
print("\n=== Fixing project statuses ===")

status_fixes = {
    "sheetcraft": "development",
    "socksmith": "development",
    "webenc": "development",
    "herald": "documentation",
}

for project, status in status_fixes.items():
    prod_status = prod_get(f"/projects/{project}").get("status")
    if prod_status == status:
        print(f"  {project}: already {status}")
    else:
        print(f"  {project}: {prod_status} -> {status}")
        prod_patch(f"/projects/{project}", {"status": status})


# --- 4. Print ID mapping ---
print("\n=== ID Mapping (localhost -> production) ===")
for old_id, new_id in sorted(id_mapping.items()):
    print(f"  {old_id} -> {new_id}")

print("\nDone!" + (" (DRY RUN)" if DRY_RUN else ""))
