# Kapazitätsplanung - agent instructions

This app belongs to the **POLYTEC Operations Platform**. Two repositories define how it must be
built. Read them before changing anything and prefer them over patterns you find in this code:

| Topic | Repository | Start at |
|---|---|---|
| Backend, runtime, operations, data, security, monitoring, identity, master data | `gma-app-standards` (local default `C:/Users/stefan.gabriel/Documents/Programme/Repo/gma-app-standards`, env `GMA_APP_STANDARDS_PATH`) | `AGENTS.md` |
| Everything rendered: shell, components, tokens, icons, brand | `polytec-design-system` (local default `C:/Users/stefan.gabriel/Documents/Programme/Repo/polytec-design-system`, env `POLYTEC_DESIGN_SYSTEM_PATH`) | `AGENTS.md` |

Run `git -C <repo> pull --ff-only` on both first so you work against the current standard.

## Never edit these vendored folders here

- `src/kapa_planung/ops_platform/` - platform kit, synced from the standards repo
- `static/polytec/`, `templates/polytec_ui/`, `templates/ops_platform_ui/` - UI Kit, synced from the design system

Fix gaps upstream first, then re-sync (see `playbooks/update-app.md` in the standards repo).

## App-specific notes

- Manifest: `app.manifest.toml` (identity, path, permissions, master data consumed).
- Add app-specific rules below this line; they may narrow the platform standard, never loosen it.


## Confirmed local prototype decisions
The user requested German UI text, local file storage before MongoDB and simultaneous operation with other apps. The tested local entry point is `python server.py`; it selects a free loopback port unless `KAPA_PORT` is set. No production service or portal registration is authorized by a local UI fix.
