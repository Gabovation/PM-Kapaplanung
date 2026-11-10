"""Web app manifest: lets a phone install the app on the home screen with its icon and name (UI-10).

iOS takes the home-screen icon from ``apple-touch-icon`` (UI Kit base template); Android and desktop
browsers read this manifest. The manifest is fetched without the session cookie, so it is open like
``/health``; it contains only the app's name and public icon paths.
"""

from __future__ import annotations

from flask import Blueprint, Flask, jsonify, request, url_for

from .manifest import AppManifest

# Technical Grey (core brand); the manifest cannot use CSS variables.
THEME_COLOR = "#25303b"
ICONS = (("polytec-app-icon-192.png", 192), ("polytec-app-icon-512.png", 512))


def init_pwa(app: Flask, manifest: AppManifest) -> None:
    blueprint = Blueprint("ops_pwa", __name__)

    @blueprint.get("/manifest.webmanifest")
    def web_manifest():  # type: ignore[no-untyped-def]
        root = request.script_root.rstrip("/") + "/"
        payload = {
            "name": manifest.name,
            "short_name": manifest.name,
            "description": manifest.description,
            "id": root,
            "start_url": root,
            "scope": root,
            "display": "standalone",
            "background_color": "#ffffff",
            "theme_color": THEME_COLOR,
            "icons": [
                {"src": url_for("polytec_ui.static", filename=f"polytec_ui/img/{name}"), "sizes": f"{size}x{size}",
                 "type": "image/png", "purpose": "any"}
                for name, size in ICONS
            ],
        }
        response = jsonify(payload)
        response.mimetype = "application/manifest+json"
        return response

    app.register_blueprint(blueprint)
    app.jinja_env.globals["web_manifest_endpoint"] = "ops_pwa.web_manifest"
