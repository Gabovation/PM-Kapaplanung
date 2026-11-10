"""Read ``app.manifest.toml`` - the identity of an app on the platform (rules REG-01..04)."""

from __future__ import annotations

import re
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

MANIFEST_FILE = "app.manifest.toml"
MANIFEST_SCHEMA = 2

_APP_ID = re.compile(r"^[a-z][a-z0-9-]{1,30}$")
_PERMISSION = re.compile(r"^[a-z][a-z0-9-]*\.[a-z][a-z0-9_.-]*$")
_CONSUMES = re.compile(r"^[a-z][a-z0-9_]*@\d+$")
KINDS = ("module", "platform-core")
LANGUAGES = ("en", "de", "sk", "cs", "nl", "hu")
# Shared context vocabulary of board widgets (decision 0021). The host fills these from the board
# context; a widget lists only the ones it understands. Context is navigation, never a grant.
WIDGET_CONTEXT = ("plantId", "workCenterNumber", "assetCode", "toolCode", "personId")
WIDGET_OPTION_TYPES = ("enum", "int", "number", "bool", "string", "list")
_ICON_NAME = re.compile(r"^[a-z][a-z0-9-]{1,40}$")
_WIDGET_ID = re.compile(r"^[a-z][a-z0-9-]{1,40}$")
_WIDGET_URL = re.compile(r"^/[a-z0-9][a-z0-9/_-]*$")
_OPTION_NAME = re.compile(r"^[a-z][A-Za-z0-9]{0,39}$")
_LABEL_FIELD = re.compile(r"^[a-zA-Z][a-zA-Z0-9]{0,39}$")
PLATFORM_SESSION_COOKIE = "ops_session"


class ManifestError(ValueError):
    pass


@dataclass(frozen=True)
class WidgetSpec:
    """One ``[[widgets]]`` entry: a page of this app that boards show in an iframe (decision 0021)."""

    widget_id: str
    version: int
    title: str
    permission: str
    url: str                      # app-relative, e.g. "/widgets/open-tasks"; the host adds /<app-id>
    context: tuple[str, ...]
    options: dict[str, dict[str, Any]]
    actions: bool = False         # True when the widget writes (e.g. prints, confirms)
    min_cols: int = 1
    min_rows: int = 1

    @property
    def key(self) -> str:
        return f"{self.widget_id}@{self.version}"


@dataclass(frozen=True)
class LabelSpec:
    """One ``[[labels]]`` entry: a label type this app prints through the portal (decision 0031).

    The portal keeps one layout per type; the app sends only the type and its field values.
    """

    label_id: str
    title: str
    permission: str
    fields: dict[str, dict[str, str]]   # name -> {"label": ..., "sample": ...}


@dataclass(frozen=True)
class AppManifest:
    app_id: str
    kind: str
    name: str
    description: str
    package: str
    version: str
    category: str
    icon: str
    owner: str
    support_contact: str
    path: str
    default_port: int
    deployment_mode: str
    service_name: str
    database: str | None
    standard_version: str
    permissions: dict[str, str]
    required_permission: str | None
    consumes: tuple[str, ...]
    languages: tuple[str, ...]
    raw: dict[str, Any]
    plants: tuple[str, ...] = ()   # plant ids a plant-bound app (Mini-App) is shown for; empty = all
    widgets: tuple[WidgetSpec, ...] = ()
    labels: tuple[LabelSpec, ...] = ()

    def widget(self, widget_id: str, version: int) -> WidgetSpec | None:
        return next((w for w in self.widgets if w.widget_id == widget_id and w.version == version), None)

    def widget_catalogue(self) -> list[dict]:
        """Entries the portal imports into ``app_widgets@1`` (REG-03)."""
        def options(widget: WidgetSpec) -> dict[str, dict[str, Any]]:
            # Choices endpoints are app-relative in the manifest and same-host paths in the catalogue.
            return {name: {**spec, "choices": f"{self.path}{spec['choices']}"} if "choices" in spec else spec
                    for name, spec in widget.options.items()}

        return [{"_id": f"{self.app_id}/{w.key}", "appId": self.app_id, "widgetId": w.widget_id,
                 "version": w.version, "title": w.title, "permission": w.permission,
                 "url": f"{self.path}{w.url}", "context": list(w.context), "options": options(w),
                 "actions": w.actions, "minCols": w.min_cols, "minRows": w.min_rows}
                for w in self.widgets]

    def label_catalogue(self) -> list[dict]:
        """Label types the portal imports for its printing layouts (REG-03, decision 0031)."""
        return [{"_id": f"{self.app_id}/{label.label_id}", "appId": self.app_id, "labelId": label.label_id,
                 "title": label.title, "permission": label.permission,
                 "fields": {name: dict(spec) for name, spec in label.fields.items()}}
                for label in self.labels]

    @property
    def is_platform_core(self) -> bool:
        return self.kind == "platform-core"

    @property
    def access_model(self) -> str:
        """``scoped`` (every module), or ``none`` for the platform core without app roles."""
        return "scoped" if self.raw.get("access") else "none"

    @property
    def display_policy(self) -> dict:
        return self.raw.get("display", {})

    def access_catalogue(self) -> dict:
        access = self.raw.get("access", {})
        return {"_id": self.app_id, "name": self.name, "scopes": access.get("scopes", []),
                "roles": self.raw.get("app_roles", {}), "permissions": self.permissions,
                "required_permission": self.required_permission}

    @property
    def session_cookie_name(self) -> str:
        # Every app shares one host name behind the proxy, so Flask's default "session"
        # cookie would be overwritten by whichever app answered last (PRX-03). The platform
        # core issues the one platform-wide login cookie (IAM-01).
        if self.is_platform_core:
            return PLATFORM_SESSION_COOKIE
        return f"{self.app_id.replace('-', '_')}_session"


def _require(section: dict[str, Any], key: str, where: str) -> Any:
    if key not in section or section[key] in ("", None):
        raise ManifestError(f"{MANIFEST_FILE}: [{where}].{key} is required")
    return section[key]


def parse_manifest(data: dict[str, Any]) -> AppManifest:
    if data.get("schema") != MANIFEST_SCHEMA:
        raise ManifestError(f"{MANIFEST_FILE}: schema must be {MANIFEST_SCHEMA}")
    app = data.get("app", {})
    runtime = data.get("runtime", {})
    access = data.get("access", {})
    master_data = data.get("master_data", {})
    permissions = dict(data.get("permissions", {}))

    app_id = _require(app, "id", "app")
    if not _APP_ID.match(app_id):
        raise ManifestError(f"{MANIFEST_FILE}: [app].id '{app_id}' must be lowercase letters, digits or '-'")
    kind = app.get("kind", "module")
    if kind not in KINDS:
        raise ManifestError(f"{MANIFEST_FILE}: [app].kind must be one of {KINDS}")
    path = _require(runtime, "path", "runtime")
    if kind == "platform-core" and path != "/":
        raise ManifestError(f"{MANIFEST_FILE}: the platform core is served at '/'")
    if kind == "module" and path != f"/{app_id}":
        raise ManifestError(f"{MANIFEST_FILE}: [runtime].path must be '/{app_id}' (no trailing slash)")
    mode = _require(runtime, "deployment_mode", "runtime")
    if mode not in ("windows-service", "console"):
        raise ManifestError(f"{MANIFEST_FILE}: [runtime].deployment_mode must be 'windows-service' or 'console'")
    for permission in permissions:
        if not _PERMISSION.match(permission) or not permission.startswith(f"{app_id}."):
            raise ManifestError(f"{MANIFEST_FILE}: permission '{permission}' must be named '{app_id}.<action>'")
    required = access.get("required_permission")
    if required and required not in permissions:
        raise ManifestError(f"{MANIFEST_FILE}: [access].required_permission '{required}' is not declared in [permissions]")
    model = access.get("model")
    # The former role model is removed (decision 0014): every module declares scoped access.
    if (kind == "module" or access) and model != "scoped":
        raise ManifestError(f"{MANIFEST_FILE}: [access].model must be 'scoped' (the former role model is removed)")
    if model == "scoped":
        scopes = access.get("scopes", [])
        roles = data.get("app_roles", {})
        if not isinstance(scopes, list) or not scopes or not all(isinstance(s, str) for s in scopes) or len(scopes) != len(set(scopes)) or set(scopes) - {"corporate", "plant", "org_unit"}:
            raise ManifestError("[access].scopes must name unique corporate, plant or org_unit scopes")
        if not required or not isinstance(roles, dict) or not roles:
            raise ManifestError("Scoped apps need required_permission and app_roles")
        for role_id, role in roles.items():
            if not isinstance(role, dict):
                raise ManifestError("App roles must be tables")
            listed = role.get("permissions", [])
            if role_id in {"inherit", "block"} or not re.fullmatch(r"[a-z][a-z0-9_-]{0,39}", role_id) or not role.get("label") or not role.get("description"):
                raise ManifestError("App roles need stable IDs, labels and descriptions")
            if not isinstance(listed, list) or not listed or not all(isinstance(p, str) for p in listed) or len(listed) != len(set(listed)) or set(listed) - set(permissions) or required not in listed:
                raise ManifestError(f"App role {role_id} must list declared permissions including required_permission")
    languages = tuple(data.get("i18n", {}).get("languages", ["en"]))
    display = data.get("display", {})
    if not isinstance(display, dict):
        raise ManifestError("Display policy must be a table")
    if display:
        roles = data.get("app_roles", {})
        allowed, reads = display.get("allowed_roles", []), display.get("read_permissions", [])
        if kind != "module" or model != "scoped" or not isinstance(allowed, list) or not allowed or not isinstance(reads, list) or not reads:
            raise ManifestError("Display access requires a scoped module, allowed_roles and read_permissions")
        if not all(isinstance(x, str) for x in allowed + reads) or len(set(allowed)) != len(allowed) or len(set(reads)) != len(reads) or set(reads) - set(permissions):
            raise ManifestError("Display policy must list unique declared roles and read permissions")
        if any(role not in roles or not set(roles[role]["permissions"]) <= set(reads) for role in allowed):
            raise ManifestError("Display roles must be existing app roles containing only declared read permissions")
        if set(display) - {"allowed_roles", "read_permissions"}:
            raise ManifestError("Unknown display policy field")
    if "en" not in languages or any(code not in LANGUAGES for code in languages):
        raise ManifestError(f"{MANIFEST_FILE}: [i18n].languages must include 'en' and use {LANGUAGES}")
    plants = app.get("plants", [])
    if not isinstance(plants, list) or not all(isinstance(p, str) and p.strip() for p in plants) or len(set(plants)) != len(plants):
        raise ManifestError(f"{MANIFEST_FILE}: [app].plants must be a list of unique plant ids, e.g. [\"PCSH\"]")
    consumes = tuple(master_data.get("consumes", []))
    for entry in consumes:
        if not _CONSUMES.match(entry):
            raise ManifestError(f"{MANIFEST_FILE}: [master_data].consumes entry '{entry}' must look like 'plants@1'")

    widgets = _parse_widgets(data.get("widgets", []), app_id, kind, permissions)
    labels = _parse_labels(data.get("labels", []), kind, permissions)

    return AppManifest(
        app_id=app_id,
        kind=kind,
        name=_require(app, "name", "app"),
        description=app.get("description", ""),
        package=_require(app, "package", "app"),
        version=_require(app, "version", "app"),
        category=app.get("category", "TBD"),
        icon=app.get("icon", "TBD"),
        owner=app.get("owner", "TBD"),
        support_contact=app.get("support_contact", "TBD"),
        path=path,
        default_port=int(_require(runtime, "default_port", "runtime")),
        deployment_mode=mode,
        service_name=_require(runtime, "service_name", "runtime"),
        database=runtime.get("database") or None,
        standard_version=_require(data, "standard_version", "root"),
        permissions=permissions,
        required_permission=required,
        consumes=consumes,
        languages=languages,
        raw=data,
        plants=tuple(plants),
        widgets=widgets,
        labels=labels,
    )


def _parse_labels(entries: Any, kind: str, permissions: dict[str, str]) -> tuple[LabelSpec, ...]:
    if not isinstance(entries, list) or not all(isinstance(e, dict) for e in entries):
        raise ManifestError(f"{MANIFEST_FILE}: [[labels]] must be an array of tables")
    if entries and kind != "module":
        raise ManifestError(f"{MANIFEST_FILE}: only modules declare labels")
    result: list[LabelSpec] = []
    for entry in entries:
        label_id = entry.get("id", "")
        where = f"[[labels]] '{label_id}'"
        if not isinstance(label_id, str) or not _WIDGET_ID.match(label_id):
            raise ManifestError(f"{MANIFEST_FILE}: {where}: id must be lowercase letters, digits or '-'")
        if any(label.label_id == label_id for label in result):
            raise ManifestError(f"{MANIFEST_FILE}: {where}: declared twice")
        unknown = set(entry) - {"id", "title", "permission", "fields"}
        if unknown:
            raise ManifestError(f"{MANIFEST_FILE}: {where}: unknown fields {sorted(unknown)}")
        title, permission, fields = entry.get("title"), entry.get("permission"), entry.get("fields")
        if not isinstance(title, str) or not title.strip() or len(title) > 60:
            raise ManifestError(f"{MANIFEST_FILE}: {where}: title is required (at most 60 characters)")
        if permission not in permissions:
            raise ManifestError(f"{MANIFEST_FILE}: {where}: permission '{permission}' is not declared in [permissions]")
        if not isinstance(fields, dict) or not 1 <= len(fields) <= 20:
            raise ManifestError(f"{MANIFEST_FILE}: {where}: fields must name 1 to 20 values")
        for name, spec in fields.items():
            label = f"{MANIFEST_FILE}: {where}: field '{name}'"
            if not isinstance(name, str) or not _LABEL_FIELD.match(name):
                raise ManifestError(f"{label}: name must be letters and digits, starting with a letter")
            if not isinstance(spec, dict) or set(spec) != {"label", "sample"}:
                raise ManifestError(f"{label}: needs exactly label and sample")
            if not isinstance(spec["label"], str) or not spec["label"].strip() or len(spec["label"]) > 60:
                raise ManifestError(f"{label}: label must be a short name")
            # The portal prints the sample in its layout preview; the same rule as for printed values.
            sample = spec["sample"]
            if (not isinstance(sample, str) or not 1 <= len(sample) <= 500 or "[" in sample or "]" in sample
                    or any(ord(c) < 32 or ord(c) == 127 for c in sample)):
                raise ManifestError(f"{label}: sample must be printable text without square brackets")
        result.append(LabelSpec(label_id, title.strip(), permission,
                                {name: {"label": spec["label"].strip(), "sample": spec["sample"]}
                                 for name, spec in fields.items()}))
    return tuple(result)


def _parse_widgets(entries: Any, app_id: str, kind: str, permissions: dict[str, str]) -> tuple[WidgetSpec, ...]:
    if not isinstance(entries, list) or not all(isinstance(e, dict) for e in entries):
        raise ManifestError(f"{MANIFEST_FILE}: [[widgets]] must be an array of tables")
    if entries and kind != "module":
        raise ManifestError(f"{MANIFEST_FILE}: only modules declare widgets")
    result: list[WidgetSpec] = []
    seen: set[tuple[str, int]] = set()
    for entry in entries:
        widget_id = entry.get("id", "")
        where = f"[[widgets]] '{widget_id}'"
        if not isinstance(widget_id, str) or not _WIDGET_ID.match(widget_id):
            raise ManifestError(f"{MANIFEST_FILE}: {where}: id must be lowercase letters, digits or '-'")
        version = entry.get("version")
        if not isinstance(version, int) or isinstance(version, bool) or version < 1:
            raise ManifestError(f"{MANIFEST_FILE}: {where}: version must be an integer >= 1")
        if (widget_id, version) in seen:
            raise ManifestError(f"{MANIFEST_FILE}: {where}: version {version} is declared twice")
        seen.add((widget_id, version))
        unknown = set(entry) - {"id", "version", "title", "permission", "url", "context", "options", "actions", "size"}
        if unknown:
            raise ManifestError(f"{MANIFEST_FILE}: {where}: unknown fields {sorted(unknown)}")
        title, permission, url = entry.get("title"), entry.get("permission"), entry.get("url", "")
        if not isinstance(title, str) or not title.strip():
            raise ManifestError(f"{MANIFEST_FILE}: {where}: title is required")
        if permission not in permissions:
            raise ManifestError(f"{MANIFEST_FILE}: {where}: permission '{permission}' is not declared in [permissions]")
        if not isinstance(url, str) or not _WIDGET_URL.match(url) or "//" in url or url.startswith(f"/{app_id}/"):
            raise ManifestError(f"{MANIFEST_FILE}: {where}: url must be an app-relative path like '/widgets/{widget_id}'")
        context = entry.get("context", [])
        if not isinstance(context, list) or len(set(context)) != len(context) or set(context) - set(WIDGET_CONTEXT):
            raise ManifestError(f"{MANIFEST_FILE}: {where}: context must list unique keys of {WIDGET_CONTEXT}")
        actions = entry.get("actions", False)
        if not isinstance(actions, bool):
            raise ManifestError(f"{MANIFEST_FILE}: {where}: actions must be true or false")
        size = entry.get("size", {})
        if not isinstance(size, dict) or set(size) - {"min_cols", "min_rows"} or not all(
                isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 24 for v in size.values()):
            raise ManifestError(f"{MANIFEST_FILE}: {where}: size takes min_cols/min_rows between 1 and 24")
        options = entry.get("options", {})
        if not isinstance(options, dict):
            raise ManifestError(f"{MANIFEST_FILE}: {where}: options must be a table")
        for name, spec in options.items():
            _check_option(name, spec, where)
            for other in (spec.get("when") or {}):
                if other not in options or other == name:
                    raise ManifestError(f"{MANIFEST_FILE}: {where}: option '{name}': when names unknown option '{other}'")
        result.append(WidgetSpec(widget_id, version, title.strip(), permission, url, tuple(context),
                                  {k: dict(v) for k, v in options.items()}, actions,
                                  size.get("min_cols", 1), size.get("min_rows", 1)))
    return tuple(result)


def _check_option(name: Any, spec: Any, where: str) -> None:
    label = f"{MANIFEST_FILE}: {where}: option '{name}'"
    if not isinstance(name, str) or not _OPTION_NAME.match(name) or name in WIDGET_CONTEXT:
        raise ManifestError(f"{label}: name must be camelCase and not a context key")
    if not isinstance(spec, dict) or spec.get("type") not in WIDGET_OPTION_TYPES or "default" not in spec:
        raise ManifestError(f"{label}: needs type {WIDGET_OPTION_TYPES} and a default")
    if set(spec) - {"type", "default", "values", "value_labels", "value_icons", "choices", "min", "max", "max_length", "label",
                    "group", "when"}:
        raise ManifestError(f"{label}: unknown fields")
    kind, default, values = spec["type"], spec["default"], spec.get("values")
    if values is not None and (not isinstance(values, list) or not values or not all(isinstance(v, str) for v in values)):
        raise ManifestError(f"{label}: values must be a non-empty list of strings")
    value_labels = spec.get("value_labels")
    if value_labels is not None and (values is None or not isinstance(value_labels, dict) or set(value_labels) - set(values)
                                     or not all(isinstance(v, str) and v.strip() for v in value_labels.values())):
        raise ManifestError(f"{label}: value_labels must name some of its values")
    value_icons = spec.get("value_icons")
    if value_icons is not None and (values is None or not isinstance(value_icons, dict) or set(value_icons) - set(values)
                                    or not all(isinstance(v, str) and _ICON_NAME.match(v) for v in value_icons.values())):
        raise ManifestError(f"{label}: value_icons must name UI Kit icons for some of its values")
    group = spec.get("group")
    if group is not None and (not isinstance(group, str) or not group.strip() or len(group) > 60):
        raise ManifestError(f"{label}: group must be a short section title")
    when = spec.get("when")
    if when is not None and (not isinstance(when, dict) or not when or not all(
            _OPTION_NAME.match(str(key)) and isinstance(wanted, list) and wanted and all(isinstance(v, str) for v in wanted)
            for key, wanted in when.items())):
        raise ManifestError(f"{label}: when must map other options to lists of the values that show this option")
    choices = spec.get("choices")
    if choices is not None and (kind not in ("string", "list") or values is not None or not isinstance(choices, str)
                                or not _WIDGET_URL.match(choices) or "//" in choices):
        raise ManifestError(f"{label}: choices must be an app-relative path, for a string or list without values")
    if kind == "enum" and (values is None or default not in values):
        raise ManifestError(f"{label}: an enum needs values that include the default")
    if kind == "int":
        low, high = spec.get("min"), spec.get("max")
        if (not isinstance(default, int) or isinstance(default, bool)
                or (low is not None and default < low) or (high is not None and default > high)):
            raise ManifestError(f"{label}: default must be an integer within min/max")
    if kind == "number":
        low, high = spec.get("min"), spec.get("max")
        number = isinstance(default, (int, float)) and not isinstance(default, bool)
        if not (default == "" or (number and (low is None or default >= low) and (high is None or default <= high))):
            raise ManifestError(f"{label}: default must be a number within min/max, or \"\" for not set")
    if kind == "bool" and not isinstance(default, bool):
        raise ManifestError(f"{label}: default must be true or false")
    if kind == "string" and not isinstance(default, str):
        raise ManifestError(f"{label}: default must be a string")
    if kind == "list" and (not isinstance(default, list) or not all(isinstance(v, str) for v in default)
                           or (values is not None and set(default) - set(values))):
        raise ManifestError(f"{label}: default must be a list of strings (from values, if given)")


def load_manifest(project_root: Path) -> AppManifest:
    path = Path(project_root) / MANIFEST_FILE
    if not path.exists():
        raise ManifestError(f"{path} not found")
    with path.open("rb") as handle:
        return parse_manifest(tomllib.load(handle))
