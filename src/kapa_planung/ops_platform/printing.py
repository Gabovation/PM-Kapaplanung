"""Client for the portal's printing API (decisions 0030, 0031). Standard rules: ARC-01, REG-11.

A module prints a label type it declares in ``[[labels]]``; the portal keeps the layout of that
type, the printers and the only durable print queue. The module submits a job once with its own
request ID, keeps the returned job ID with its domain record and lets a person print again with
the same request ID when the portal was unreachable. The module runs no queue of its own.

Configuration in ``.env``: ``PLATFORM_PRINTING_URL`` (the environment's HTTPS base URL) and
``PLATFORM_PRINTING_TOKEN`` (the module credential, provisioned with the portal's
``tools/provision_printing_client.py --app <id>``).
"""
from __future__ import annotations

import json
import os
import threading
import time
from copy import deepcopy
from hashlib import sha256
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

# Job states reported by the portal. "uncertain": the printer may have printed; never resent automatically.
OPEN = ("queued", "claimed", "sending")
FINAL = ("sent", "failed", "cancelled")

_CATALOGUE: dict[tuple[str, str], tuple[float, dict]] = {}
_CATALOGUE_LOCK = threading.Lock()


class PrintingUnavailable(RuntimeError):
    """The portal could not be reached or failed; the job was not accepted. Print again later."""


class PrintingRejected(PrintingUnavailable):
    """The portal refused the request (printer, label type or values); printing again will not help."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


class PlatformPrinting:
    def __init__(self, base: str | None = None, token: str | None = None) -> None:
        self.base = (base or os.getenv("PLATFORM_PRINTING_URL", "")).rstrip("/")
        self.token = token or os.getenv("PLATFORM_PRINTING_TOKEN", "")

    def request(self, path: str, data: Any = None) -> Any:
        parsed = urlsplit(self.base)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
            raise PrintingUnavailable("Configure the environment HTTPS platform URL.")
        if len(self.token) < 32:
            raise PrintingUnavailable("Configure the module printing credential.")
        message = Request(self.base + "/api/printing/" + path,
                          data=json.dumps(data).encode() if data is not None else None,
                          headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"})
        try:
            with build_opener(_NoRedirect()).open(message, timeout=5) as response:  # nosec B310 - https checked above
                value = response.read(65537)
                if len(value) > 65536:
                    raise ValueError("Oversized printing response.")
                return json.loads(value)
        except HTTPError as exc:
            if 400 <= exc.code < 500 and exc.code != 429:
                raise PrintingRejected("Platform rejected this print request. Review printer, label type and values.") from exc
            raise PrintingUnavailable("Platform printing unavailable.") from exc
        except Exception as exc:
            raise PrintingUnavailable("Platform printing unavailable.") from exc

    def catalogue(self) -> dict:
        """``{"printers": [{_id, name, state}], "labels": [{labelId, title, ready}]}``, cached for 30 seconds.

        ``labels`` are this module's label types; ``ready`` is false while the portal has no layout.
        """
        key = (self.base, sha256(self.token.encode()).hexdigest())
        with _CATALOGUE_LOCK:
            cached = _CATALOGUE.get(key)
            if cached and time.monotonic() - cached[0] < 30:
                return deepcopy(cached[1])
            result = self.request("catalogue")
            _CATALOGUE.clear()
            _CATALOGUE[key] = (time.monotonic(), result)
            return deepcopy(result)

    def print_label(self, label: str, printer_id: str, values: dict[str, str], request_id: str) -> dict:
        """Submit one label of a declared type. Returns ``{id, status, message}``.

        The same ``request_id`` with the same data returns the existing job instead of printing twice.
        """
        return self.request("jobs", {"requestId": request_id, "printerId": printer_id, "label": label,
                                     "values": values})

    def statuses(self, identifiers) -> list[dict]:
        """Current ``{id, status, message}`` of up to 50 jobs of this module."""
        return self.request("jobs/status", {"ids": list(identifiers)[:50]})["jobs"]

    def cancel(self, identifier: str) -> None:
        """Cancel a job that is still queued; a claimed job can no longer be cancelled."""
        self.request("jobs/" + quote(identifier, safe="") + "/cancel", {})

    def printer_status(self, identifier: str) -> dict:
        """Ask the portal to check one printer now; returns ``{_id, state}``."""
        return self.request("printers/" + quote(identifier, safe="") + "/status", {})
