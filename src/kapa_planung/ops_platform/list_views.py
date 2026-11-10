"""Saved list views for wide, catalogue-driven lists (UI-12, decision 0028).

A view is personal (``ownerId`` = person) or shared (``ownerId`` None): shared views are visible to
everyone who can open the list and only the app's sharers (``may_share``) manage them. Each list has
one personal default per person and one shared default. Context keys (usually ``plant``) are never
stored in a view; they stay as the request chose them. Views never grant access: apps revalidate the
returned state before querying or saving it. Requests create no indexes.
"""
from __future__ import annotations

import hashlib
import json
import secrets
from datetime import UTC, datetime
from typing import Any, Mapping
from urllib.parse import urlencode

from werkzeug.datastructures import MultiDict

from .i18n import t

MAX_VIEWS = 50          # per list and owner (one person, or the shared views)
MAX_STATE_BYTES = 16384
SYMBOLS = {'eq': '=', 'gte': '≥', 'lte': '≤'}


class ViewConflict(Exception):
    """An existing name or a stale revision requires review, not an automatic overwrite."""


class ViewInvalid(ValueError):
    pass


def ordered_columns(raw: MultiDict, available: list[str], default: list[str], required: list[str]) -> list[str]:
    """Only the domain's column keys can shape rendering; mandatory identity columns come first."""
    chosen = list(dict.fromkeys(raw.getlist('columns'))) if 'columns_set' in raw else list(default)
    ordered = list(dict.fromkeys([*required, *chosen]))
    if len(ordered) > 32 or any(key not in available for key in chosen):
        raise ViewInvalid('Choose available columns (at most 32).')
    return ordered


def _pointer(kind: str, person: str | None) -> str:
    return hashlib.sha256(json.dumps(['default', kind, person]).encode()).hexdigest()


def _number(revision: Any) -> int:
    return int(revision) if str(revision).isdigit() else -1


class ViewStore:
    def __init__(self, collection: Any, defaults: Any, context: tuple[str, ...] = ('plant',)):
        self.collection = collection
        self.defaults = defaults
        self.context = context
        self._cache: dict[tuple[str, ...], Any] = {}

    def visible(self, kind: str, person: str | None) -> list[dict[str, Any]]:
        """The person's own views and the shared views of this list, by name (one query per request)."""
        key = ('visible', kind, person or '')
        if key not in self._cache:
            owners = [None, person] if person else [None]
            self._cache[key] = list(self.collection.find({'kind': kind, 'ownerId': {'$in': owners}}).sort('name', 1))
        return self._cache[key]

    def pointers(self, kind: str, person: str | None) -> dict[str, dict[str, Any] | None]:
        """The personal and the shared default pointer of this list (one query per request)."""
        key = ('pointers', kind, person or '')
        if key not in self._cache:
            ids = {'personal': _pointer(kind, person) if person else None, 'shared': _pointer(kind, None)}
            found = {d['_id']: d for d in self.defaults.find({'_id': {'$in': [i for i in ids.values() if i]}})}
            self._cache[key] = {source: found.get(identity) for source, identity in ids.items()}
        return self._cache[key]

    @staticmethod
    def writable(view: Mapping[str, Any], person: str | None, may_share: bool) -> bool:
        if view.get('ownerId') is None:
            return may_share
        return bool(person) and view.get('ownerId') == person

    def _state(self, view: Mapping[str, Any], raw: MultiDict) -> MultiDict:
        if view.get('schema') != 1 or not isinstance(view.get('state'), dict):
            raise ViewInvalid('This saved view needs to be recreated.')
        state = MultiDict({key: value for key, value in view['state'].items() if key not in self.context})
        for key in self.context:
            if key in raw:
                state.setlist(key, raw.getlist(key))
        return state

    def resolve(self, kind: str, raw: MultiDict, person: str | None,
                state_keys: tuple[str, ...]) -> tuple[MultiDict, dict[str, Any] | None, str]:
        """Explicit state wins, then the personal default, the shared default and the built-in state.

        `view` opens a saved view; `view_id` names the view an adjusted state came from without
        reapplying its saved filters. Canonical state links carry `f=1`, so a deliberately cleared
        list is never replaced by a default. Returns (state, view, source).
        """
        views = {view['_id']: view for view in self.visible(kind, person)}
        selected = raw.get('view')
        if selected and selected != 'standard':
            if selected not in views:
                raise ViewInvalid('This view is not available to you.')
            return self._state(views[selected], raw), views[selected], 'explicit'
        if 'view' in raw or 'f' in raw or any(key in raw for key in state_keys if key not in self.context):
            return MultiDict(raw), views.get(raw.get('view_id')), 'explicit'
        for source, pointer in self.pointers(kind, person).items():
            if pointer is None:
                continue
            if pointer.get('viewId') is None:
                return MultiDict(raw), None, source
            view = views.get(pointer['viewId'])
            if view:  # a deleted or no longer visible view falls through to the next default
                return self._state(view, raw), view, source
        return MultiDict(raw), None, 'standard'

    def save(self, kind: str, state: dict[str, Any], name: str, person: str | None, *, shared: bool = False,
             may_share: bool = False, view_id: str = '', revision: Any = '') -> dict[str, Any]:
        name = name.strip()
        state = {key: value for key, value in state.items() if key not in self.context}
        if not person:
            raise ViewInvalid('Sign in to save views.')
        if not name or len(name) > 60 or len(json.dumps(state)) > MAX_STATE_BYTES:
            raise ViewInvalid('Enter a view name of at most 60 characters and a valid view.')
        if shared and not may_share:
            raise ViewInvalid('Only list administrators can share views.')
        owner = None if shared else person
        now = datetime.now(UTC)
        if view_id:
            current = self.collection.find_one({'_id': view_id, 'kind': kind})
            if not current or not self.writable(current, person, may_share):
                raise ViewInvalid('This view is not available for editing.')
            if current.get('ownerId') != owner or current['name'].casefold() != name.casefold():
                raise ViewInvalid('Use Save as new to change a view name or who sees it.')
            result = self.collection.update_one({'_id': view_id, 'revision': _number(revision)},
                {'$set': {'schema': 1, 'name': name, 'state': state, 'updatedAt': now, 'updatedBy': person},
                 '$inc': {'revision': 1}})
            if not result.matched_count:
                raise ViewConflict('This view changed. Reload it before saving.')
        else:
            siblings = list(self.collection.find({'kind': kind, 'ownerId': owner}, {'name': 1}))
            if any(view['name'].casefold() == name.casefold() for view in siblings):
                raise ViewConflict('A view with this name already exists. Choose another name.')
            if len(siblings) >= MAX_VIEWS:
                raise ViewInvalid('Delete an unused view first (50 views per list).')
            # Random ids: a stale editor of a deleted view can never overwrite a new one of the same name.
            view_id = secrets.token_urlsafe(16)
            self.collection.insert_one({'_id': view_id, 'schema': 1, 'kind': kind, 'ownerId': owner, 'name': name,
                'state': state, 'revision': 1, 'createdAt': now, 'createdBy': person, 'updatedAt': now, 'updatedBy': person})
        self._cache.clear()
        return self.collection.find_one({'_id': view_id})

    def set_default(self, kind: str, person: str | None, view_id: str | None, *, shared: bool = False,
                    may_share: bool = False) -> None:
        """Point the personal or the shared default at a visible view, or at the built-in view (None).

        A pointer is presentation only: the last choice wins and the previous view is kept.
        """
        if not person:
            raise ViewInvalid('Sign in to choose a default view.')
        if shared and not may_share:
            raise ViewInvalid('Only list administrators can set the default for everyone.')
        if view_id:
            view = next((v for v in self.visible(kind, person) if v['_id'] == view_id), None)
            if view is None:
                raise ViewInvalid('This view is not available to you.')
            if shared and view.get('ownerId') is not None:
                raise ViewInvalid('Share the view with everyone before making it their default.')
            self._state(view, MultiDict())
        owner = None if shared else person
        if shared and not view_id:
            self.defaults.delete_one({'_id': _pointer(kind, None)})
        else:
            self.defaults.update_one({'_id': _pointer(kind, owner)}, {'$set': {'kind': kind, 'ownerId': owner,
                'viewId': view_id, 'updatedAt': datetime.now(UTC), 'updatedBy': person}}, upsert=True)
        self._cache.clear()

    def reset_default(self, kind: str, person: str | None) -> None:
        """Remove the personal default; the list then opens with the shared default."""
        if person:
            self.defaults.delete_one({'_id': _pointer(kind, person)})
        self._cache.clear()

    def delete(self, kind: str, view_id: str, person: str | None, may_share: bool, revision: Any) -> None:
        current = self.collection.find_one({'_id': view_id, 'kind': kind})
        if not current or not self.writable(current, person, may_share):
            raise ViewInvalid('This view is not available for deletion.')
        if not self.collection.delete_one({'_id': view_id, 'revision': _number(revision)}).deleted_count:
            raise ViewConflict('This view changed. Reload before deleting it.')
        self._cache.clear()


def view_context(store: ViewStore, *, kind: str, state: dict[str, Any], columns: list[dict[str, Any]],
                 fields: list[dict[str, Any]], person: str | None, may_share: bool, current: dict[str, Any] | None,
                 urls: dict[str, str], csrf: str, csrf_name: str = 'csrf_token', max_conditions: int = 8,
                 standard_state: dict[str, Any] | None = None) -> dict[str, Any]:
    """The small, JSON-safe contract of the UI Kit's view_manager(). Only field definitions and
    preference values leave the app; HTML and database paths do not belong to it.

    `columns` are the ordered column choices, `fields` the typed condition fields (key, label, type,
    optional unit, allowed operators and choices), `urls` the list page and the save/default/delete
    endpoints. Active-filter chips come from filter_chips().
    """
    conditions = {f'{part}{i}' for i in range(max_conditions) for part in ('field', 'op', 'value')}
    transport = {'f', 'view_id', 'columns_set'}

    def definition(values: Mapping[str, Any]) -> dict[str, Any]:
        # What a saved view stores, without context, transport markers, empty values and unused operators.
        return {key: value for key, value in values.items()
                if key not in transport and key not in store.context and value not in ('', [], None)
                and not (key.startswith('op') and key[2:].isdigit() and not values.get('field' + key[2:]))}

    labels = {
        'saved_view': t('Saved view'), 'standard': t('Standard view'), 'settings': t('View settings'),
        'columns': t('Columns'), 'position': t('Position'), 'required': t('Required'), 'find_column': t('Find a column'),
        'name': t('View name'), 'scope': t('Visible to'),
        'personal': t('Only me'), 'shared': t('Everyone'), 'defaults': t('Default view'), 'field': t('Field'),
        'comparison': t('Comparison'), 'value': t('Value'), 'no_condition': t('No condition'), 'choose_value': t('Choose a value'),
        'save_failed': t('The view could not be saved. Your settings are retained. Please try again.'),
        'enter_name': t('Enter a view name of at most 60 characters.'),
        'delete_confirm': t('Delete this saved view? The list data is kept.'),
        'save_first': t('Save the adjusted view before changing its default.'),
    }
    adjusted = definition(state) != definition(current.get('state', {}) if current else standard_state or {})
    if adjusted:
        labels['saved_view'] += ' · ' + t('Adjusted')
    pointers = store.pointers(kind, person)
    current_id = current['_id'] if current else None
    default_label = ''
    if pointers['personal'] and pointers['personal'].get('viewId') == current_id:
        default_label = t('Your default')
    elif pointers['shared'] and pointers['shared'].get('viewId') == current_id:
        default_label = t('Default for everyone')
    return {'list_url': urls['list'], 'save_url': urls['save'], 'default_url': urls['default'], 'delete_url': urls['delete'],
        'state': state, 'context': {key: state[key] for key in store.context if key in state},
        'hidden': {key: value for key, value in state.items() if key not in conditions | transport | {'columns'}},
        'columns': columns, 'fields': fields, 'max_conditions': max_conditions,
        'person': bool(person), 'may_share': may_share, 'adjusted': adjusted, 'csrf': csrf, 'csrf_name': csrf_name,
        'labels': labels,
        'saved': [{'id': v['_id'], 'label': v['name'] + (' · ' + t('Shared') if v.get('ownerId') is None else '')}
                  for v in store.visible(kind, person)],
        'current': {'id': current['_id'], 'name': current['name'], 'shared': current.get('ownerId') is None,
                    'revision': str(current.get('revision', 0)), 'writable': bool(person) and store.writable(current, person, may_share)}
                   if current else None,
        'has_personal_default': pointers['personal'] is not None, 'default_label': default_label}


def _format_number(value: str) -> str:
    # LNG-07: one format for every language - thin-space thousands (1 500), decimal point, ISO dates.
    try:
        number = float(value)
    except ValueError:
        return value
    text = f'{number:,.0f}' if number.is_integer() else f'{number:,}'
    return text.replace(',', ' ')


def _value_text(field: Mapping[str, Any], value: str) -> str:
    if field.get('type') in ('integer', 'decimal'):
        text = _format_number(value)
    else:
        text = dict(field.get('options') or []).get(value, value)
    return f"{text} {field['unit']}" if field.get('unit') else text


def filter_chips(state: Mapping[str, Any], *, list_url: str, controls: list[dict[str, Any]] = (),
                 fields: list[dict[str, Any]] = (), max_conditions: int = 8) -> dict[str, Any]:
    """Active filters as removable chips for the UI Kit's filter_chips() macro; no database access.

    `controls` are quick filters with name, label, optional options [(value, label)] and default
    ("" or [] by default); every value of a multiple choice is a chip of its own. `fields` are the
    typed condition fields of view_context(); comparisons are shown as = ≥ ≤ with numbers as 1 500 (LNG-07).
    """
    def link(**changes: Any) -> str:
        return list_url + '?' + urlencode({**state, **changes, 'f': '1'}, doseq=True)

    groups, cleared = [], {}
    for control in controls:
        name, default = control['name'], control.get('default', '')
        value = state.get(name, default)
        cleared[name] = default
        if value in ('', [], None) or value == default:
            continue
        names = dict(control.get('options') or [])
        values = value if isinstance(value, list) else [value]
        items = [{'text': names.get(v, v), 'remove_url': link(**{name: [o for o in values if o != v] if isinstance(value, list) else default})}
                 for v in values]
        groups.append({'label': control['label'], 'items': items})
    by_key = {field['key']: field for field in fields}
    for index in range(max_conditions):
        key, op, value = state.get(f'field{index}', ''), state.get(f'op{index}', 'eq'), state.get(f'value{index}', '')
        empty = {f'field{index}': '', f'op{index}': 'eq', f'value{index}': ''}
        cleared.update(empty)
        if key not in by_key or not (value or op in ('present', 'missing')):
            continue
        field = by_key[key]
        if op in ('present', 'missing'):
            text = t('filled') if op == 'present' else t('empty')
        elif op == 'contains':
            text = t('contains {value}', value=value)
        elif op == 'eq' and field.get('type') not in ('integer', 'decimal', 'date'):
            text = _value_text(field, value)
        else:
            text = f"{SYMBOLS.get(op, op)} {_value_text(field, value)}"
        groups.append({'label': field['label'], 'items': [{'text': text, 'remove_url': link(**empty)}]})
    for group in groups:
        for item in group['items']:
            item['remove_label'] = t('Remove filter: {filter}', filter=f"{group['label']} {item['text']}")
    return {'groups': groups, 'clear_url': link(**cleared) if groups else ''}
