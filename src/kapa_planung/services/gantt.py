"""Validierung des Projektterminplans (Gantt). Die Terminrechnung selbst macht der Browser."""
from __future__ import annotations

from datetime import date
import re

MAX_TASKS = 500
MAX_LEVEL = 5
MAX_LINKS = 10
LINK_TYPES = ('FS', 'SS', 'FF', 'SF')
ID_PATTERN = re.compile(r'[A-Za-z0-9_-]{1,64}')
TASK_ID_PATTERN = re.compile(r'[A-Za-z0-9_-]{1,32}')


def valid_project_id(value) -> bool:
    return isinstance(value, str) and bool(ID_PATTERN.fullmatch(value))


def _integer(value, low, high) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high


def _iso(value) -> bool:
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        return False
    try:
        return date.fromisoformat(value).isoformat() == value and 2000 <= int(value[:4]) <= 2100
    except ValueError:
        return False


def validate_gantt(data, project_id: str) -> None:
    """Prüft Struktur und Grenzen. Die Reihenfolge der Liste ist die Anzeigereihenfolge,
    die Gliederungsebene (`level`) bestimmt wie in MS Project die Zugehörigkeit zu Sammelvorgängen."""
    if not isinstance(data, dict) or data.get('projectId') != project_id:
        raise ValueError('Ungültiger Projektplan.')
    tasks = data.get('tasks')
    if not isinstance(tasks, list) or len(tasks) > MAX_TASKS:
        raise ValueError(f'Ein Projektplan darf höchstens {MAX_TASKS} Vorgänge enthalten.')
    ids = []
    for task in tasks:
        if not isinstance(task, dict) or not isinstance(task.get('id'), str) or not TASK_ID_PATTERN.fullmatch(task['id']):
            raise ValueError('Ungültiger Vorgang.')
        ids.append(task['id'])
    if len(set(ids)) != len(ids):
        raise ValueError('Vorgangs-IDs müssen eindeutig sein.')
    index = {task_id: position for position, task_id in enumerate(ids)}
    levels = []
    for position, task in enumerate(tasks):
        name = task.get('name')
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 120:
            raise ValueError('Der Vorgangsname muss 1 bis 120 Zeichen enthalten.')
        kind = task.get('type', 'task')
        if kind not in ('task', 'milestone'):
            raise ValueError('Ungültiger Vorgangstyp.')
        level = task.get('level')
        if not _integer(level, 0, MAX_LEVEL):
            raise ValueError(f'Die Gliederungsebene muss zwischen 0 und {MAX_LEVEL} liegen.')
        previous = levels[-1] if levels else -1
        if level > previous + 1:
            raise ValueError('Die Gliederung überspringt eine Ebene.')
        if position and tasks[position - 1].get('type', 'task') == 'milestone' and level > previous:
            raise ValueError('Ein Meilenstein kann keine Unterpunkte haben.')
        levels.append(level)
        if not _iso(task.get('start')):
            raise ValueError('Ungültiger Anfangstermin.')
        if task.get('snet') is not None and not _iso(task['snet']):
            raise ValueError('Ungültiger Termin „Anfang nicht früher als“.')
        duration = task.get('durationDays')
        if not _integer(duration, 0, 3650) or (kind == 'milestone' and duration != 0) or (kind == 'task' and duration < 1):
            raise ValueError('Ungültige Dauer.')
        if not _integer(task.get('percent', 0), 0, 100):
            raise ValueError('Der Fortschritt muss zwischen 0 und 100 % liegen.')
        note = task.get('note', '')
        if not isinstance(note, str) or len(note) > 500:
            raise ValueError('Die Bemerkung darf höchstens 500 Zeichen enthalten.')
    parents = _parents(levels)
    has_children = {parent for parent in parents if parent is not None}
    graph: dict[int, list[int]] = {position: [] for position in range(len(tasks))}
    for position, task in enumerate(tasks):
        links = task.get('links', [])
        if not isinstance(links, list) or len(links) > MAX_LINKS:
            raise ValueError(f'Ein Vorgang darf höchstens {MAX_LINKS} Vorgänger haben.')
        if links and position in has_children:
            raise ValueError('Sammelvorgänge können keine Vorgänger haben; ihre Termine ergeben sich aus den Unterpunkten.')
        seen = set()
        for link in links:
            if not isinstance(link, dict) or link.get('from') not in index or link.get('type') not in LINK_TYPES \
                    or not _integer(link.get('lagDays', 0), -365, 365):
                raise ValueError('Ungültige Verknüpfung.')
            source = index[link['from']]
            if source == position or link['from'] in seen:
                raise ValueError('Ungültige Verknüpfung.')
            seen.add(link['from'])
            if _is_ancestor(parents, source, position) or _is_ancestor(parents, position, source):
                raise ValueError('Ein Vorgang kann nicht mit seinem eigenen Sammelvorgang verknüpft werden.')
            graph[source].append(position)
    # Ein Sammelvorgang hängt von seinen Unterpunkten ab: Kante Unterpunkt → Sammelvorgang.
    for position, parent in enumerate(parents):
        if parent is not None:
            graph[position].append(parent)
    if _has_cycle(graph):
        raise ValueError('Die Verknüpfungen enthalten einen Zirkelbezug.')


def _parents(levels):
    stack: list[int] = []
    result = []
    for position, level in enumerate(levels):
        del stack[level:]
        result.append(stack[-1] if stack else None)
        stack.append(position)
    return result


def _is_ancestor(parents, ancestor, node) -> bool:
    current = parents[node]
    while current is not None:
        if current == ancestor:
            return True
        current = parents[current]
    return False


def _has_cycle(graph) -> bool:
    state: dict[int, int] = {}
    for root in graph:
        if root in state:
            continue
        stack = [(root, iter(graph[root]))]
        state[root] = 1
        while stack:
            node, children = stack[-1]
            for child in children:
                if state.get(child) == 1:
                    return True
                if child not in state:
                    state[child] = 1
                    stack.append((child, iter(graph[child])))
                    break
            else:
                state[node] = 2
                stack.pop()
    return False
