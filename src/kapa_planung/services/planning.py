"""Validate persisted absolute hour plans independently of the browser calculation."""
from __future__ import annotations

from datetime import date


def _whole(value, maximum=1_000_000):
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= maximum


def _calendar(value):
    if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value:
        raise ValueError("Ungültiges Datum in der Stundenplanung.")
    return value


def validate_hour_plans(snapshot: dict) -> None:
    for project in snapshot.get("projects", []):
        if not isinstance(project, dict):
            raise ValueError("Ungültiges Projekt.")
        if "hourPlan" not in project:
            continue
        plan = project["hourPlan"]
        if not isinstance(plan, dict) or plan.get("version") != 1 or plan.get("granularity") not in ("week", "month"):
            raise ValueError("Ungültiges Planungsraster.")
        budget, percent, gates = project.get("budget"), project.get("percent"), project.get("dates")
        if (not _whole(budget) or not isinstance(percent, list) or len(percent) != 4
                or not all(_whole(value, 100) for value in percent) or sum(percent) != 100
                or not isinstance(gates, list) or len(gates) != 5):
            raise ValueError("Ungültiges Projektbudget oder ungültige Gate-Verteilung.")
        gates = [_calendar(value) for value in gates]
        if any(gates[index] >= gates[index + 1] for index in range(4)):
            raise ValueError("Die Gate-Termine müssen aufsteigend sein.")
        expected = {}
        phase_hours = [budget * value // 100 for value in percent]
        remainder_order = sorted(range(4), key=lambda index: (-(budget * percent[index] % 100), index))
        for index in remainder_order[:budget - sum(phase_hours)]:
            phase_hours[index] += 1
        for index, hours in enumerate(phase_hours):
            expected[f"phase-{index}"] = (gates[index], gates[index + 1], hours)
        changes = project.get("changes", [])
        if not isinstance(changes, list):
            raise ValueError("Ungültige Planwertänderungen.")
        for change in changes:
            if not isinstance(change, dict) or not isinstance(change.get("id"), str) or not _whole(change.get("hours")):
                raise ValueError("Ungültige Planwertänderung.")
            start, key = _calendar(change.get("date")), "change-" + change["id"]
            if not gates[0] <= start < gates[4] or key in expected:
                raise ValueError("Ungültige oder doppelte Planwertänderung.")
            expected[key] = (start, gates[4], change["hours"])
        rows = plan.get("sources")
        if not isinstance(rows, dict) or set(rows) != set(expected):
            raise ValueError("Die Stundenplanung muss alle Gate-Phasen und Planwertänderungen enthalten.")
        for key, (start, end, hours) in expected.items():
            row = rows[key]
            if (not isinstance(row, dict) or not _whole(row.get("budget"))
                    or (row.get("start"), row.get("end"), row.get("budget")) != (start, end, hours)):
                raise ValueError("Die Stundenplanung passt nicht zu den aktuellen Gate-Budgets.")
            daily = row.get("daily")
            if not isinstance(daily, dict):
                raise ValueError("Ungültige Stundenwerte.")
            for day, value in daily.items():
                if not start <= _calendar(day) < end or not _whole(value):
                    raise ValueError("Stunden müssen ganzzahlig, nicht negativ und innerhalb der Phase liegen.")
            if sum(daily.values()) != hours:
                raise ValueError("Die Summe der Stunden muss dem jeweiligen Gate- oder Änderungsbudget entsprechen.")
