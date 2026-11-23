"""Excel- und PDF-Export des Projektplans."""
from io import BytesIO

import pytest
from openpyxl import load_workbook

from kapa_planung.services import gantt_export as export
from test_gantt import server, session_client  # noqa: F401  (Fixture und Hilfsfunktionen des Projektplans)


def row(nr, level, name, kind, start, end, duration, percent, predecessors='', **extra):
    return {'nr': nr, 'level': level, 'name': name, 'kind': kind, 'start': start, 'end': end, 'duration': duration,
            'percent': percent, 'predecessors': predecessors, **extra}


def model(fmt='xlsx', **override):
    data = {
        'format': fmt, 'projectName': 'Testprojekt (Ä)', 'projectNumber': '41-22-030', 'createdAt': '2026-11-23',
        'options': {'baseline': True, 'critical': True, 'customer': False},
        'rows': [
            row(1, 0, 'Konzept', 'summary', '2026-11-02', '2026-11-25', 18, 74),
            row(2, 1, 'Anforderungen', 'task', '2026-11-02', '2026-11-11', 8, 100),
            row(3, 1, '=SUM(A1) Konzept', 'task', '2026-11-12', '2026-11-25', 10, 60, '2', critical=True, slack=0,
                baselineStart='2026-11-12', baselineEnd='2026-11-24', variance=1),
            row(4, 1, 'Freigabe', 'milestone', '2026-11-25', '2026-11-25', 0, 0, '3', critical=True, slack=0,
                baselineStart='2026-11-25', baselineEnd='2026-11-25', variance=0),
        ],
        'links': [{'from': 2, 'to': 3, 'type': 'FS', 'critical': True}, {'from': 3, 'to': 4, 'type': 'FS', 'critical': False}],
        'gates': [{'label': 'G3', 'date': '2026-11-02'}, {'label': 'G5', 'date': '2027-01-11'}],
    }
    data.update(override)
    return data


def test_helvetica_width_table_is_complete():
    assert len(export._WIDTHS) == 95


def test_xlsx_content_and_formula_safety():
    content, name, mime = export.build(export.validate_export(model()))
    assert name == 'Projektplan_41-22-030_2026-11-23.xlsx' and mime.endswith('spreadsheetml.sheet')
    sheet = load_workbook(BytesIO(content)).active
    assert sheet['B6'].value == 'Vorgang' and sheet['H6'].value == 'Basis-Anfang' and sheet['K6'].value == 'Puffer (AT)'
    assert sheet['B9'].value == '=SUM(A1) Konzept' and sheet['B9'].data_type == 's'          # bleibt Text, keine Formel
    assert sheet['D9'].value.year == 2026 and sheet['G9'].value == 0.6 and sheet['J9'].value == 1
    # Gantt-Bereich: Balken des ersten Vorgangs sind farbig gefüllt, der Meilenstein ist eine Raute
    filled = [cell for cell in sheet[8][12:] if cell.fill.fill_type == 'solid']
    assert filled and any(cell.value == '◆' for cell in sheet[10])


def test_xlsx_without_optional_columns():
    data = model(options={'baseline': False, 'critical': False, 'customer': True})
    sheet = load_workbook(BytesIO(export.build(export.validate_export(data))[0])).active
    assert sheet['G6'].value == 'Fortschritt' and sheet['H6'].value is None  # keine Basisplan- und Pufferspalten


def test_pdf_is_wellformed_and_paginates():
    content, name, mime = export.build(export.validate_export(model('pdf')))
    assert name.endswith('.pdf') and mime == 'application/pdf' and content.startswith(b'%PDF-1.4') and content.rstrip().endswith(b'%%EOF')
    many = model('pdf')
    many['rows'] = [row(i, 0, f'Vorgang {i} mit längerem Namen für den Zuschnitt in der Tabelle', 'task', '2026-11-02', '2026-11-27', 20, i % 100)
                    for i in range(1, 101)]
    many['links'] = [{'from': i, 'to': i + 1, 'type': 'FS', 'critical': False} for i in range(1, 100)]
    pdf = export.build(export.validate_export(many))[0]
    assert pdf.count(b'/Type /Page ') == 4  # 100 Zeilen, 33 je Seite


def test_pdf_text_escaping_and_unencodable_characters():
    data = model('pdf')
    data['rows'][1]['name'] = 'Klammer ) ( und \\ sowie ✓ Zeichen'
    pdf = export.build(export.validate_export(data))[0]
    assert pdf.startswith(b'%PDF')


@pytest.mark.parametrize('change', [
    {'format': 'docx'},
    {'projectName': ''},
    {'createdAt': 'heute'},
    {'options': {'baseline': 'ja'}},
    {'rows': []},
    {'links': [{'from': 1, 'to': 99, 'type': 'FS'}]},
    {'links': [{'from': 1, 'to': 1, 'type': 'FS'}]},
    {'links': [{'from': 1, 'to': 2, 'type': 'XX'}]},
    {'gates': [{'label': '', 'date': '2026-11-02'}]},
    {'gates': [{'label': 'G3', 'date': 'x'}]},
])
def test_invalid_export_models_are_rejected(change):
    with pytest.raises(ValueError):
        export.validate_export(model(**change))


def test_invalid_rows_are_rejected():
    for patch in ({'nr': 5}, {'kind': 'x'}, {'start': '2026-12-01'}, {'percent': 101}, {'name': ''}, {'level': 9},
                  {'baselineStart': '2026-11-01'}, {'variance': 'x'}, {'slack': True}, {'critical': 'ja'}):
        data = model()
        data['rows'][1].update(patch)
        with pytest.raises(ValueError):
            export.validate_export(data)


def test_export_route_permissions_and_download(server):  # noqa: F811
    app, _ = server
    client, headers = session_client(app)
    url = '/api/gantt/p1/export'
    assert client.post(url, json=model()).status_code == 403                       # ohne Token
    xlsx = client.post(url, json=model('xlsx'), headers=headers)
    assert xlsx.status_code == 200 and xlsx.mimetype.endswith('spreadsheetml.sheet')
    assert 'attachment; filename="Projektplan_41-22-030_2026-11-23.xlsx"' == xlsx.headers['Content-Disposition']
    assert xlsx.headers['X-Content-Type-Options'] == 'nosniff' and load_workbook(BytesIO(xlsx.data)).active['B7'].value == 'Konzept'
    xml = client.post(url, json=model('xml'), headers=headers)
    assert xml.status_code == 200 and xml.mimetype == 'application/xml' and xml.data.startswith(b'<?xml')
    pdf = client.post(url, json=model('pdf'), headers=headers)
    assert pdf.status_code == 200 and pdf.mimetype == 'application/pdf' and pdf.data.startswith(b'%PDF')
    assert client.post(url, json={'format': 'pdf'}, headers=headers).status_code == 400
    assert client.post(url, data='kein json', headers=headers).status_code == 400
    assert client.post('/api/gantt/unbekannt/export', json=model(), headers=headers).status_code == 404
    assert client.get(url).status_code == 405


def test_export_route_denies_other_roles(server):  # noqa: F811
    app, _ = server
    for name, password in (('planer', 'planer-password-123'), ('qvp', 'qvp-password-1234'), ('reader', 'reader-password-123')):
        client, headers = session_client(app, name, password)
        assert client.post('/api/gantt/p1/export', json=model(), headers=headers).status_code == 403
    client, headers = session_client(app, 'homeoffice', 'ho-password-12345')
    assert client.post('/api/gantt/p1/export', json=model(), headers=headers).status_code == 200


def test_internal_flag_is_validated():
    from kapa_planung.services.gantt import validate_gantt
    from test_gantt import plan, task
    validate_gantt(plan(task('a', internal=True)), 'p1')
    with pytest.raises(ValueError):
        validate_gantt(plan(task('a', internal='ja')), 'p1')


def test_ms_project_xml():
    import xml.etree.ElementTree as ET
    data = model('xml')
    data['rows'][2]['name'] = 'A & B <c> "d"\x01'
    data['links'] = [{'from': 2, 'to': 3, 'type': 'FS', 'critical': True, 'lag': 2}, {'from': 3, 'to': 4, 'type': 'SS', 'lag': -1}]
    content, name, mime = export.build(export.validate_export(data))
    assert name == 'Projektplan_41-22-030_2026-11-23.xml' and mime == 'application/xml'
    ns = {'p': 'http://schemas.microsoft.com/project'}
    root = ET.fromstring(content)
    tasks = root.findall('.//p:Task', ns)
    assert [task.find('p:Name', ns).text for task in tasks] == ['Konzept', 'Anforderungen', 'A & B <c> "d"', 'Freigabe']
    assert [task.find('p:OutlineLevel', ns).text for task in tasks] == ['1', '2', '2', '2']
    assert [task.find('p:OutlineNumber', ns).text for task in tasks] == ['1', '1.1', '1.2', '1.3']
    assert tasks[0].find('p:Summary', ns).text == '1' and tasks[3].find('p:Milestone', ns).text == '1'
    assert tasks[1].find('p:Duration', ns).text == 'PT64H0M0S'          # 8 Arbeitstage zu je 8 Stunden
    assert tasks[3].find('p:Duration', ns).text == 'PT0H0M0S'
    first = tasks[2].find('p:PredecessorLink', ns)
    assert first.find('p:PredecessorUID', ns).text == '2' and first.find('p:Type', ns).text == '1' and first.find('p:LinkLag', ns).text == '9600'
    second = tasks[3].find('p:PredecessorLink', ns)
    assert second.find('p:Type', ns).text == '3' and second.find('p:LinkLag', ns).text == '-4800'  # AA mit -1 Tag
    assert tasks[2].find('p:Critical', ns).text == '1' and tasks[2].find('p:Baseline/p:Start', ns).text == '2026-11-12T08:00:00'
    assert root.find('p:Calendars/p:Calendar/p:UID', ns).text == '1'


def test_ms_project_xml_without_baseline_and_critical():
    import xml.etree.ElementTree as ET
    data = model('xml', options={'baseline': False, 'critical': False, 'customer': True})
    root = ET.fromstring(export.build(export.validate_export(data))[0])
    ns = {'p': 'http://schemas.microsoft.com/project'}
    assert root.find('.//p:Baseline', ns) is None
    assert {task.find('p:Critical', ns).text for task in root.findall('.//p:Task', ns)} == {'0'}


def test_link_lag_is_validated():
    for lag in (366, -366, 'x', True):
        data = model()
        data['links'] = [{'from': 2, 'to': 3, 'type': 'FS', 'lag': lag}]
        with pytest.raises(ValueError):
            export.validate_export(data)


def test_hours_column_in_xlsx_and_pdf():
    rows = model()['rows']
    for item, hours in zip(rows, (50, 20, 30, 0)):
        item['hours'] = hours
    data = model(options={'baseline': False, 'critical': False, 'customer': False, 'hours': True}, rows=rows)
    sheet = load_workbook(BytesIO(export.build(export.validate_export(data))[0])).active
    assert sheet['H6'].value == 'Stunden' and sheet['H7'].value == 50 and sheet['H8'].value == 20 and sheet['H10'].value is None
    pdf = export.build(export.validate_export(dict(data, format='pdf')))[0]
    plain_pdf = export.build(export.validate_export(dict(data, format='pdf', options=dict(data['options'], hours=False))))[0]
    assert pdf.startswith(b'%PDF') and pdf != plain_pdf  # Stundenspalte verändert das PDF
    plain = load_workbook(BytesIO(export.build(export.validate_export(model(options={'baseline': False, 'critical': False, 'customer': False})))[0])).active
    assert plain['H6'].value is None  # ohne Option keine Stundenspalte


def test_invalid_hours_in_export_are_rejected():
    data = model(options={'baseline': False, 'critical': False, 'customer': False, 'hours': True})
    data['rows'][1]['hours'] = -5
    with pytest.raises(ValueError):
        export.validate_export(data)
    data = model(options={'baseline': False, 'critical': False, 'customer': False, 'hours': 'ja'})
    with pytest.raises(ValueError):
        export.validate_export(data)
