"""Environment loading and validation shared by main.py, the Windows service and the .bat scripts."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import dotenv_values, load_dotenv

# Values that only ever appear in .env.example; starting with them must fail (SEC-05).
PLACEHOLDER_MARKERS = ("<db_username>", "<db_password>", "<host>", "REPLACE_", "YOUR-", "CHANGE_ME")
REQUIRED_KEYS = ("APP_ENV", "APP_PORT", "MONGODB_URI")
ENVIRONMENTS = ("local", "dev", "prd")


def load_project_env(project_root: Path) -> None:
    # override=False keeps values already set by the service account or the shell.
    load_dotenv(Path(project_root) / ".env", override=False)


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    return int(raw) if raw else default


def env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


def app_environment() -> str:
    return os.getenv("APP_ENV", "local").strip().lower() or "local"


def validate_env_file(project_root: Path) -> list[str]:
    """Return human-readable problems with ``.env``; an empty list means it is usable."""
    env_file = Path(project_root) / ".env"
    if not env_file.exists():
        return [".env is missing - copy .env.example to .env and fill in real values"]
    values = {key: (value or "").strip() for key, value in dotenv_values(env_file).items()}
    problems = []
    for key in REQUIRED_KEYS:
        value = values.get(key, "")
        if not value:
            problems.append(f"{key} is empty")
        elif any(marker in value for marker in PLACEHOLDER_MARKERS):
            problems.append(f"{key} still contains a placeholder from .env.example")
    if values.get("APP_PORT") and not values["APP_PORT"].isdigit():
        problems.append("APP_PORT must be numeric")
    if values.get("APP_ENV") and values["APP_ENV"].lower() not in ENVIRONMENTS:
        problems.append(f"APP_ENV must be one of {', '.join(ENVIRONMENTS)}")
    secret = values.get("APP_SECRET_KEY", "")
    if any(marker in secret for marker in PLACEHOLDER_MARKERS):
        problems.append("APP_SECRET_KEY still contains a placeholder - generate one or leave it empty for local")
    elif values.get("APP_ENV", "").lower() == "prd" and len(secret) < 32:
        problems.append("APP_SECRET_KEY with at least 32 characters is required when APP_ENV=prd")
    return problems
