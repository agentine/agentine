"""Logging setup for agentine — file-based with optional console output."""

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path


def _find_repo_root() -> Path:
    """Walk up from this file to find the directory containing pyproject.toml."""
    p = Path(__file__).resolve().parent
    while p != p.parent:
        if (p / "pyproject.toml").exists():
            return p
        p = p.parent
    raise RuntimeError("Could not find repo root (no pyproject.toml)")


LOG_DIR = _find_repo_root() / "log"


def setup_logging(name: str, *, console: bool = False) -> logging.Logger:
    """Configure and return a logger that writes to log/{name}.log.

    Args:
        name: Logger name and log file stem.
        console: If True, also log to stderr.
    """
    LOG_DIR.mkdir(exist_ok=True)

    logger = logging.getLogger(f"agentine.{name}")
    logger.setLevel(logging.DEBUG)

    # Avoid duplicate handlers on repeated calls
    if logger.handlers:
        return logger

    fmt = logging.Formatter("%(asctime)s %(levelname)-8s %(message)s")

    fh = RotatingFileHandler(
        LOG_DIR / f"{name}.log",
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=5,
    )
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    if console:
        ch = logging.StreamHandler()
        ch.setLevel(logging.INFO)
        ch.setFormatter(fmt)
        logger.addHandler(ch)

    return logger
