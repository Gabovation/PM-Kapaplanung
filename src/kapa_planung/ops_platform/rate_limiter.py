"""In-memory sliding-window rate limiter (SEC-02, SEC-03).

    from <package>.ops_platform.rate_limiter import rate_limit

    @app.post("/api/widgets")
    @rate_limit("widgets-write", env="RATE_LIMIT_WRITE_PER_MINUTE", default=60)
    def create_widget(): ...
"""

from __future__ import annotations

import math
import threading
import time
from collections import deque
from dataclasses import dataclass
from functools import wraps
from typing import Any, Callable

from flask import jsonify

from .config import env_int
from .security import client_identity


@dataclass(frozen=True, slots=True)
class RateLimitResult:
    allowed: bool
    retry_after_seconds: int


class InMemoryRateLimiter:
    """Sliding-window limiter keyed by bucket and client identity. Per process, not shared."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._events: dict[tuple[str, str], deque[float]] = {}

    def allow(self, bucket: str, identity: str, limit: int, *, window_seconds: float = 60.0) -> RateLimitResult:
        if limit <= 0:
            return RateLimitResult(allowed=True, retry_after_seconds=0)
        now = time.monotonic()
        key = (bucket, identity or "unknown")
        with self._lock:
            queue = self._events.setdefault(key, deque())
            threshold = now - window_seconds
            while queue and queue[0] <= threshold:
                queue.popleft()
            if len(queue) >= limit:
                return RateLimitResult(False, max(1, math.ceil(window_seconds - (now - queue[0]))))
            queue.append(now)
        return RateLimitResult(allowed=True, retry_after_seconds=0)


limiter = InMemoryRateLimiter()


def rate_limit(bucket: str, *, env: str, default: int,
               identity: Callable[[], str] | None = None) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Reject with 429 + Retry-After once ``bucket`` exceeds the per-minute limit from ``env``."""

    def decorator(view: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(view)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            # A resource identity must come from a preceding mandatory verifier, never
            # directly from an untrusted header. Keep an outer IP limit for failed auth.
            result = limiter.allow(bucket, identity() if identity else client_identity(), env_int(env, default))
            if not result.allowed:
                response = jsonify({"error": "rate_limited", "retryAfterSeconds": result.retry_after_seconds})
                response.status_code = 429
                response.headers["Retry-After"] = str(result.retry_after_seconds)
                return response
            return view(*args, **kwargs)

        return wrapper

    return decorator
