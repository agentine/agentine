"""Shared configuration for agentine — env loading, paths, agent config, API client."""

import os
import tomllib
from dataclasses import dataclass
from pathlib import Path

import requests


def _find_repo_root() -> Path:
    """Walk up from this file to find the directory containing pyproject.toml."""
    p = Path(__file__).resolve().parent
    while p != p.parent:
        if (p / "pyproject.toml").exists():
            return p
        p = p.parent
    raise RuntimeError("Could not find repo root (no pyproject.toml)")


REPO_ROOT = _find_repo_root()
PROJECTS_DIR = REPO_ROOT / "projects"
TEMPLATES_DIR = REPO_ROOT / "templates"

# Load .env if present
_env_path = REPO_ROOT / ".env"
if _env_path.exists():
    for _line in _env_path.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#"):
            _line = _line.removeprefix("export").strip()
            if "=" in _line:
                _key, _, _val = _line.partition("=")
                os.environ.setdefault(_key.strip(), _val.strip("'\""))

API_URL = os.environ.get("API_URL", "https://agentine.mtingers.com")
API_KEY = os.environ.get("API_KEY", "")
HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}


@dataclass
class AgentConfig:
    role: str
    backend: str
    model: str
    effort: str


@dataclass
class DispatchConfig:
    short_break: int = 300  # seconds between normal iterations
    long_break: int = 1800  # seconds for extended breaks
    long_break_every: int = 4  # take a long break every N iterations
    max_workers: int = 4  # parallel agent slots
    retry_delays: list[int] | None = None  # default retry delays
    retry_max_attempts: int = 3
    oom_delays: list[int] | None = None  # OOM/crash retry delays
    oom_max_attempts: int = 2

    def __post_init__(self):
        if self.retry_delays is None:
            self.retry_delays = [60, 300, 600]
        if self.oom_delays is None:
            self.oom_delays = [300, 600]


def load_config(path: str = "agents.toml") -> tuple[list[AgentConfig], DispatchConfig]:
    """Load agent and dispatch configuration from TOML file."""
    conf_path = REPO_ROOT / path
    if not conf_path.exists():
        raise FileNotFoundError(f"{path} not found")

    with open(conf_path, "rb") as f:
        data = tomllib.load(f)

    # Dispatch config
    d = data.get("dispatch", {})
    dispatch = DispatchConfig(
        short_break=d.get("short_break", 300),
        long_break=d.get("long_break", 1800),
        long_break_every=d.get("long_break_every", 4),
        max_workers=d.get("max_workers", 4),
        retry_delays=d.get("retry_delays"),
        retry_max_attempts=d.get("retry_max_attempts", 3),
        oom_delays=d.get("oom_delays"),
        oom_max_attempts=d.get("oom_max_attempts", 2),
    )

    # Agent configs
    defaults = data.get("defaults", {})
    agents = []
    for entry in data.get("agents", []):
        agents.append(
            AgentConfig(
                role=entry["role"],
                backend=entry.get("backend", defaults.get("backend", "claude")),
                model=entry.get("model", defaults.get("model", "claude-opus-4-6")),
                effort=entry.get("effort", defaults.get("effort", "max")),
            )
        )
    return agents, dispatch


def api(method: str, path: str, **kwargs) -> requests.Response | None:
    """Make an API request. Returns None on connection error."""
    try:
        return requests.request(
            method, f"{API_URL}{path}", headers=HEADERS, timeout=30, **kwargs
        )
    except requests.RequestException as e:
        print(f"  api error: {method} {path} — {e}")
        return None
