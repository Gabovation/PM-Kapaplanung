"""File logging under ``logs/`` with daily rotation (LOG-01..03)."""

from __future__ import annotations

import logging
import os
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

from .config import env_int

FORMAT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"


def configure_logging(project_root: Path, file_name: str = "app.log") -> logging.Logger:
    log_dir = Path(project_root) / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    root = logging.getLogger()
    target = str(log_dir / file_name)
    if any(getattr(handler, "baseFilename", None) == target for handler in root.handlers):
        return root
    handler = TimedRotatingFileHandler(
        target, when="midnight", backupCount=env_int("LOG_RETENTION_DAYS", 30), encoding="utf-8"
    )
    handler.setFormatter(logging.Formatter(FORMAT))
    root.addHandler(handler)
    root.setLevel(logging.getLevelName(os.getenv("LOG_LEVEL", "INFO").upper()))
    # Waitress logs every queue warning at WARNING; keep it but not its INFO chatter.
    logging.getLogger("waitress").setLevel(logging.WARNING)
    return root
