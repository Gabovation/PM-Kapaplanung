from datetime import datetime
from io import BytesIO

import openpyxl
import pytest

from kapa_planung.services.sap_import import HEADERS, project_from_psp, read_export


def workbook(rows):
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.append(HEADERS)
    for row in rows:
        sheet.append(row)
    output = BytesIO()
    book.save(output)
    return output.getvalue()


def test_parse_realistic_rows_without_collapsing_duplicate_bookings():
    row = ['Beispiel Person', '123', '10-02763-000-99', datetime(2026, 10, 1), 5.25, 'H', 'Projektmanagement']
    rows = read_export(workbook([row, row, ['', '123', '', '', 10.5, 'H', '']]))
    assert len(rows) == 2
    assert rows[0]['projectNumber'] == '10-02763'
    assert rows[0]['department'] == '99'
    assert rows[0]['date'] == '2026-10-01'
    assert rows[0]['hours'] == 5.25
    assert rows[1]['hours'] == 5.25


def test_unassigned_booking_is_preserved():
    rows = read_export(workbook([['Test', '123', None, datetime(2026, 10, 1), 1, 'H', 'Sonstiges']]))
    assert rows[0]['projectNumber'] is None


def test_invalid_booking_is_not_silently_dropped():
    with pytest.raises(ValueError, match='Buchungsdatum'):
        read_export(workbook([['Test', '123', '10-02763-00-99', None, 1, 'H', 'Projekt']]))


def test_psp_separates_only_the_last_two_components():
    assert project_from_psp('10-02763-00-99') == ('10-02763', '99')
    assert project_from_psp('11-111-111-000-99') == ('11-111-111', '99')
    assert project_from_psp('ungültig') is None


def test_preview_endpoint_requires_token_and_does_not_change_planning(client, monkeypatch):
    import kapa_planung.web as web
    from pathlib import Path
    monkeypatch.setattr(web, 'DATA', Path('no-sap-preview-data.json'))
    file = workbook([['Test', '123', '10-02763-000-99', datetime(2026, 10, 1), 2.5, 'H', 'Projekt']])
    assert client.post('/api/sap-preview', data={'file': (BytesIO(file), 'sap.xlsx')}).status_code == 403
    response = client.post('/api/sap-preview', data={'file': (BytesIO(file), 'sap.xlsx')}, headers={'X-Kapa-Token': web.TOKEN})
    assert response.status_code == 200
    assert response.json['rows'][0]['projectNumber'] == '10-02763'
    assert not web.DATA.exists()


def test_validate_actuals_rejects_inconsistent_project_number():
    from kapa_planung.services.sap_import import validate_actuals
    row = read_export(workbook([['Test', '123', '10-02763-000-99', datetime(2026, 10, 1), 2.5, 'H', 'Projekt']]))[0]
    validate_actuals({'sapActuals': [row]})
    row['projectNumber'] = '10-99999'
    with pytest.raises(ValueError, match='PSP'):
        validate_actuals({'sapActuals': [row]})


def test_legacy_psp_uses_three_project_segments_and_department():
    assert project_from_psp('41-22-030-00-00-99') == ('41-22-030', '99')
    assert project_from_psp('41-22-104-00-00-99') == ('41-22-104', '99')
    row = ['Test', '123', '41-22-030-00-00-99', datetime(2026, 10, 1), 7.75, 'H', 'Projektmanagement']
    assert read_export(workbook([row]))[0]['projectNumber'] == '41-22-030'


def test_previously_imported_legacy_psp_remains_valid():
    from kapa_planung.services.sap_import import validate_actuals
    row = read_export(workbook([['Test', '123', '41-22-030-00-00-99', datetime(2026, 10, 1), 1, 'H', 'Projekt']]))[0]
    validate_actuals({'sapActuals': [row]})
    row['projectNumber'] = '41-22-030-00'
    validate_actuals({'sapActuals': [row]})
    row['projectNumber'] = '41-22-031'
    with pytest.raises(ValueError, match='PSP'):
        validate_actuals({'sapActuals': [row]})
