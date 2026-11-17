"""Read-only parsing of SAP time exports. No rows are deduplicated or saved here."""
from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from math import isfinite
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile
import re

from openpyxl import load_workbook

HEADERS = ('Nachname Vorname', 'Personalnummer', 'Empfänger-PSP-Element', 'Datum',
           'Anzahl (Maßeinheit)', 'Interne Maßeinheit', 'Kontierungstext')
MAX_EXPANDED = 30_000_000
MAX_ROWS = 10_000
PSP = re.compile(r'^(.+)-([0-9]+)-([0-9]+)$')
LEGACY_PSP = re.compile(r'^([0-9]{2}-[0-9]{2}-[0-9]{3})-[0-9]{2}-[0-9]{2}-([0-9]{2})$')


def project_from_psp(value: str) -> tuple[str, str] | None:
    """Separate project and department; retain the complete project part exactly."""
    legacy = LEGACY_PSP.fullmatch(value.strip())
    if legacy:
        return legacy.group(1), legacy.group(2)
    match = PSP.fullmatch(value.strip())
    return (match.group(1), match.group(3)) if match else None


def read_export(data: bytes) -> list[dict]:
    try:
        with ZipFile(BytesIO(data)) as archive:
            entries = archive.infolist()
            if (len(entries) > 1000 or sum(entry.file_size for entry in entries) > MAX_EXPANDED
                    or any(entry.flag_bits & 1 or '..' in PurePosixPath(entry.filename).parts for entry in entries)):
                raise ValueError('Die Excel-Datei ist zu groß oder ungültig.')
        workbook = load_workbook(BytesIO(data), read_only=True, data_only=True, keep_links=False)
    except (BadZipFile, OSError, KeyError, ValueError) as exc:
        raise ValueError('Die Datei ist keine gültige unterstützte XLSX-Datei.') from exc
    try:
        matches = []
        for sheet in workbook.worksheets:
            rows = sheet.iter_rows(values_only=True)
            headers = next(rows, ())
            positions = {str(value).strip(): i for i, value in enumerate(headers) if value is not None}
            if all(header in positions for header in HEADERS):
                matches.append((sheet, positions))
        if len(matches) != 1:
            raise ValueError('Die Datei muss genau ein Tabellenblatt mit den SAP-Spalten enthalten.')
        sheet, positions = matches[0]
        output = []
        for row_number, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), 2):
            if row_number > MAX_ROWS + 1:
                raise ValueError('Der Export enthält zu viele Buchungszeilen.')
            def field(name):
                index = positions[name]
                return row[index] if index < len(row) else None
            if all(value is None for value in row):
                continue
            value, when = field(HEADERS[4]), field(HEADERS[3])
            # Accept subtotal/grand-total rows only if they reconcile to preceding bookings.
            if not when and not field(HEADERS[0]) and not field(HEADERS[2]) and not field(HEADERS[6]):
                personnel = str(field(HEADERS[1]) or '').strip()
                relevant = [item for item in output if not personnel or item['personnelNumber'] == personnel]
                if (not relevant or isinstance(value, bool) or not isinstance(value, (int, float))
                        or not isfinite(value) or abs(sum(item['hours'] for item in relevant) - value) > 0.000001):
                    raise ValueError(f'Nicht zuordenbare Summenzeile {row_number}.')
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
                raise ValueError(f'Ungültige Stundenzahl in Zeile {row_number}.')
            if isinstance(when, datetime):
                when = when.date()
            if not isinstance(when, date):
                raise ValueError(f'Ungültiges Buchungsdatum in Zeile {row_number}.')
            unit = str(field(HEADERS[5]) or '').strip()
            if unit.upper() != 'H':
                raise ValueError(f'Unbekannte Zeiteinheit in Zeile {row_number}.')
            if not str(field(HEADERS[1]) or '').strip():
                raise ValueError(f'Personalnummer fehlt in Zeile {row_number}.')
            psp = str(field(HEADERS[2]) or '').strip()
            parsed = project_from_psp(psp)
            output.append({'row': row_number, 'name': str(field(HEADERS[0]) or '').strip(),
                           'personnelNumber': str(field(HEADERS[1]) or '').strip(),
                           'psp': psp, 'projectNumber': parsed[0] if parsed else None,
                           'department': parsed[1] if parsed else None, 'date': when.isoformat(),
                           'hours': value, 'description': str(field(HEADERS[6]) or '').strip()})
        if not output:
            raise ValueError('Der Export enthält keine Buchungen.')
        return output
    finally:
        workbook.close()


def validate_actuals(snapshot: dict) -> None:
    """Validate optional imported rows in ordinary writes and restored backups."""
    rows = snapshot.get('sapActuals', [])
    if not isinstance(rows, list) or len(rows) > MAX_ROWS:
        raise ValueError('Ung\u00fcltige Anzahl SAP-Buchungen.')
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError('Ung\u00fcltige SAP-Buchung.')
        for key in ('name', 'personnelNumber', 'psp', 'description'):
            if not isinstance(row.get(key), str) or len(row[key]) > 500:
                raise ValueError('Ung\u00fcltige Angaben in einer SAP-Buchung.')
        if not row['personnelNumber']:
            raise ValueError('Eine SAP-Buchung ben\u00f6tigt eine Personalnummer.')
        for key in ('projectNumber', 'department'):
            if row.get(key) is not None and (not isinstance(row[key], str) or len(row[key]) > 500):
                raise ValueError('Ung\u00fcltige PSP-Zuordnung.')
        stored = (row['projectNumber'], row['department']) if row.get('projectNumber') is not None else None
        current = project_from_psp(row['psp'])
        # Older imports stripped two segments even for legacy PSPs. Keep them
        # loadable and editable; the UI derives the corrected project from PSP.
        old = PSP.fullmatch(row['psp'].strip()) if LEGACY_PSP.fullmatch(row['psp'].strip()) else None
        old_mapping = (old.group(1), old.group(3)) if old else None
        if stored != current and (not old or stored != old_mapping):
            raise ValueError('Die PSP-Zuordnung stimmt nicht mit dem PSP-Element \u00fcberein.')
        try:
            if date.fromisoformat(row['date']).isoformat() != row['date']:
                raise ValueError
        except (KeyError, TypeError, ValueError):
            raise ValueError('Ung\u00fcltiges SAP-Buchungsdatum.') from None
        hours = row.get('hours')
        if isinstance(hours, bool) or not isinstance(hours, (float, int)) or not isfinite(hours) or abs(hours) > 10000:
            raise ValueError('Ung\u00fcltige SAP-Stundenzahl.')
