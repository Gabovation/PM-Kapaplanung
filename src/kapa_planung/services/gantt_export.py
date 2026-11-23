"""Export des Projektplans als Excel (.xlsx) und PDF. Der Browser liefert die gerade sichtbaren, bereits
berechneten Zeilen; der Server prüft sie und baut die Datei. Es gibt keine zusätzliche Abhängigkeit:
Excel über openpyxl, PDF über einen kleinen eigenen Schreiber mit den Standardschriften (Helvetica)."""
from __future__ import annotations

from datetime import date, timedelta
from io import BytesIO
import re
import zlib

from kapa_planung.services.gantt import MAX_LEVEL, MAX_TASKS, _integer, _iso

KINDS = ('task', 'summary', 'milestone')
LINK_TYPES = ('FS', 'SS', 'FF', 'SF')
FORMATS = ('xlsx', 'pdf', 'xml')
MAX_LINKS = 5000
BAR, SUMMARY, CRITICAL, BASELINE, GATE, TODAY, GRID, STRIPE = '#416680', '#25303B', '#9E0C26', '#8A949C', '#FAB72D', '#D32F2F', '#D2D7DB', '#F4F6F8'


def _text(value, limit, *, required=False) -> bool:
    return isinstance(value, str) and len(value) <= limit and (not required or bool(value.strip()))


def validate_export(data) -> dict:
    """Prüft das Exportmodell und gibt es unverändert zurück."""
    if not isinstance(data, dict) or data.get('format') not in FORMATS:
        raise ValueError('Ungültiges Exportformat.')
    if not _text(data.get('projectName'), 120, required=True) or not _text(data.get('projectNumber', ''), 40) \
            or not _iso(data.get('createdAt')):
        raise ValueError('Ungültige Projektangaben.')
    options = data.get('options', {})
    if not isinstance(options, dict) or any(not isinstance(options.get(key, False), bool) for key in ('baseline', 'critical', 'customer')):
        raise ValueError('Ungültige Exportoptionen.')
    rows = data.get('rows')
    if not isinstance(rows, list) or not rows or len(rows) > MAX_TASKS:
        raise ValueError('Der Export enthält keine sichtbaren Vorgänge.')
    numbers = set()
    for position, row in enumerate(rows, start=1):
        if not isinstance(row, dict) or row.get('nr') != position or row.get('kind') not in KINDS \
                or not _integer(row.get('level'), 0, MAX_LEVEL) or not _text(row.get('name'), 120, required=True) \
                or not _iso(row.get('start')) or not _iso(row.get('end')) or row['start'] > row['end'] \
                or not _integer(row.get('duration'), 0, 3650) or not _integer(row.get('percent'), 0, 100) \
                or not _text(row.get('predecessors', ''), 120):
            raise ValueError('Ungültige Zeile im Export.')
        if (row.get('baselineStart') is None) != (row.get('baselineEnd') is None) \
                or (row.get('baselineStart') is not None and not (_iso(row['baselineStart']) and _iso(row['baselineEnd']) and row['baselineStart'] <= row['baselineEnd'])):
            raise ValueError('Ungültiger Basisplan im Export.')
        if row.get('variance') is not None and not _integer(row['variance'], -3650, 3650):
            raise ValueError('Ungültige Abweichung im Export.')
        if row.get('slack') is not None and not _integer(row['slack'], -3650, 3650):
            raise ValueError('Ungültiger Puffer im Export.')
        if not isinstance(row.get('critical', False), bool):
            raise ValueError('Ungültige Zeile im Export.')
        numbers.add(position)
    links = data.get('links', [])
    if not isinstance(links, list) or len(links) > MAX_LINKS or any(
            not isinstance(link, dict) or link.get('from') not in numbers or link.get('to') not in numbers
            or link['from'] == link['to'] or link.get('type') not in LINK_TYPES or not isinstance(link.get('critical', False), bool) or not _integer(link.get('lag', 0), -365, 365)
            for link in links):
        raise ValueError('Ungültige Verknüpfung im Export.')
    gates = data.get('gates', [])
    if not isinstance(gates, list) or len(gates) > 8 or any(
            not isinstance(gate, dict) or not _text(gate.get('label'), 12, required=True) or not _iso(gate.get('date')) for gate in gates):
        raise ValueError('Ungültige Gates im Export.')
    return data


def file_name(model) -> str:
    number = re.sub(r'[^A-Za-z0-9_-]+', '-', model.get('projectNumber') or model['projectName']).strip('-')[:40] or 'Projekt'
    return f"Projektplan_{number}_{model['createdAt']}.{model['format']}"


def _day(value: str) -> int:
    return date.fromisoformat(value).toordinal()


def _german(value: str) -> str:
    return date.fromisoformat(value).strftime('%d.%m.%Y')


def _range(model):
    days = [_day(row[key]) for row in model['rows'] for key in ('start', 'end')]
    days += [_day(gate['date']) for gate in model.get('gates', [])]
    for row in model['rows']:
        if row.get('baselineStart'):
            days += [_day(row['baselineStart']), _day(row['baselineEnd'])]
    first = min(days) - 3
    first -= (date.fromordinal(first).weekday())  # auf Montag
    return first, max(days) + 8


def _legend(model) -> list[str]:
    options = model.get('options', {})
    items = []
    if options.get('critical'):
        items.append('Rot: kritischer Pfad')
    if options.get('baseline'):
        items.append('Grau: Basisplan')
    return items


# --------------------------------------------------------------------------------------------- Excel
def build_xlsx(model) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    options, rows = model.get('options', {}), model['rows']
    show_base, show_crit = options.get('baseline') and any(r.get('baselineStart') for r in rows), options.get('critical')
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = 'Projektplan'
    thin = Side(style='thin', color=GRID[1:])
    fill = lambda color: PatternFill('solid', start_color=color[1:], end_color=color[1:])
    headers = ['Nr.', 'Vorgang', 'Dauer (AT)', 'Anfang', 'Ende', 'Vorgänger', 'Fortschritt']
    if show_base:
        headers += ['Basis-Anfang', 'Basis-Ende', 'Abw. Ende (AT)']
    if show_crit:
        headers += ['Puffer (AT)']
    title = f"{model.get('projectNumber', '')} · {model['projectName']}".strip(' ·')

    def put(cell, value, **style):
        cell.value = value
        if isinstance(value, str):
            cell.data_type = 's'  # Text bleibt Text, auch wenn er mit = oder + beginnt (keine Formeln aus Eingaben)
        for key, item in style.items():
            setattr(cell, key, item)

    put(sheet.cell(1, 1), title, font=Font(bold=True, size=14))
    put(sheet.cell(2, 1), f"Projektplan · Stand {_german(model['createdAt'])}", font=Font(color='54616C'))
    legend = _legend(model)
    if legend:
        put(sheet.cell(3, 1), ' · '.join(legend), font=Font(color='54616C', italic=True))
    header_row = 6
    first_day, last_day = _range(model)
    weeks = list(range(first_day, last_day, 7))
    gantt_start = len(headers) + 2
    for column, text in enumerate(headers, start=1):
        put(sheet.cell(header_row, column), text, font=Font(bold=True, color='FFFFFF'), fill=fill(SUMMARY),
            alignment=Alignment(horizontal='center' if column != 2 else 'left', vertical='center', wrap_text=True))
    today = date.fromisoformat(model['createdAt']).toordinal()
    gate_weeks = {}
    for gate in model.get('gates', []):
        gate_weeks.setdefault((_day(gate['date']) - first_day) // 7, []).append(gate['label'])
    for offset, week_start in enumerate(weeks):
        column = gantt_start + offset
        monday = date.fromordinal(week_start)
        put(sheet.cell(header_row - 1, column), monday.strftime('%m/%y') if offset == 0 or monday.day <= 7 else None,
            font=Font(size=8, bold=True), alignment=Alignment(horizontal='left'))
        put(sheet.cell(header_row, column), monday.isocalendar()[1], font=Font(size=8, bold=True, color='FFFFFF'), fill=fill(SUMMARY),
            alignment=Alignment(horizontal='center', vertical='center', text_rotation=90))
        sheet.column_dimensions[get_column_letter(column)].width = 2.6
    if gate_weeks:
        put(sheet.cell(header_row - 2, 1), 'Gates', font=Font(bold=True, size=8))
        for index, labels in gate_weeks.items():
            if 0 <= index < len(weeks):
                put(sheet.cell(header_row - 2, gantt_start + index), '/'.join(label.replace('Gate ', 'G') for label in labels),
                    font=Font(size=7, bold=True), fill=fill(GATE), alignment=Alignment(horizontal='center'))
    sheet.row_dimensions[header_row].height = 34
    for position, row in enumerate(rows):
        line = header_row + 1 + position
        critical = show_crit and row.get('critical')
        kind = row['kind']
        font = Font(bold=kind == 'summary', color=CRITICAL[1:] if critical else '25303B')
        values = [row['nr'], row['name'], row['duration'], date.fromisoformat(row['start']), date.fromisoformat(row['end']),
                  row.get('predecessors', ''), row['percent'] / 100]
        if show_base:
            has_base = bool(row.get('baselineStart'))
            values += [date.fromisoformat(row['baselineStart']) if has_base else None,
                       date.fromisoformat(row['baselineEnd']) if has_base else None, row.get('variance')]
        if show_crit:
            values += [row.get('slack')]
        for column, value in enumerate(values, start=1):
            cell = sheet.cell(line, column)
            put(cell, value, font=font, border=Border(bottom=thin),
                alignment=Alignment(horizontal='left' if column == 2 else 'center', indent=row['level'] * 2 if column == 2 else 0, vertical='center'))
            if isinstance(value, date):
                cell.number_format = 'DD.MM.YYYY'
            elif column == 7:
                cell.number_format = '0%'
        start, end = _day(row['start']), _day(row['end'])
        color = CRITICAL if critical else SUMMARY if kind == 'summary' else BAR
        for offset, week_start in enumerate(weeks):
            cell = sheet.cell(line, gantt_start + offset)
            cell.border = Border(bottom=thin)
            if kind == 'milestone':
                if week_start <= start < week_start + 7:
                    put(cell, '◆', font=Font(bold=True, color=CRITICAL[1:]), alignment=Alignment(horizontal='center'))
            elif start < week_start + 7 and end >= week_start:
                cell.fill = fill(color)
            if today >= week_start and today < week_start + 7 and cell.fill.fill_type is None:
                cell.fill = fill(STRIPE)
    sheet.freeze_panes = sheet.cell(header_row + 1, 3)
    for column, width in zip('ABCDEFG', (6, 44, 11, 12, 12, 14, 12)):
        sheet.column_dimensions[column].width = width
    for column in range(8, len(headers) + 1):
        sheet.column_dimensions[get_column_letter(column)].width = 14
    sheet.column_dimensions[get_column_letter(len(headers) + 1)].width = 2
    sheet.page_setup.orientation = 'landscape'
    sheet.page_setup.paperSize = sheet.PAPERSIZE_A3
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.print_title_rows = f'{header_row}:{header_row}'
    workbook.properties.title = f'Projektplan {title}'[:120]
    workbook.properties.creator = 'Kapazitätsplanung'
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


# ----------------------------------------------------------------------------------------------- PDF
# Breiten der Standardschrift Helvetica (je 1000 Einheiten) für Zeichen 32 bis 126.
_WIDTHS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278] + [556] * 10 + \
    [278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778,
     722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222,
     222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]


def _width(text: str, size: float, bold=False) -> float:
    total = sum(_WIDTHS[ord(ch) - 32] if 32 <= ord(ch) <= 126 else 556 for ch in text)
    return total * size / 1000 * (1.06 if bold else 1)


def _fit(text: str, size: float, limit: float, bold=False) -> str:
    if _width(text, size, bold) <= limit:
        return text
    while text and _width(text + '…', size, bold) > limit:
        text = text[:-1]
    return text.rstrip() + '…'


def _rgb(color: str) -> str:
    return ' '.join(f'{int(color[i:i + 2], 16) / 255:.3f}' for i in (1, 3, 5))


class _Page:
    def __init__(self, height):
        self.height = height
        self.ops: list[bytes] = []

    def _add(self, text: str):
        self.ops.append(text.encode('ascii'))

    def rect(self, x, top, w, h, fill=None, stroke=None, width=0.5):
        paint = ('B' if fill and stroke else 'f' if fill else 'S')
        self._add(f'q {_rgb(fill) + " rg " if fill else ""}{_rgb(stroke) + " RG " if stroke else ""}{width} w {x:.2f} {self.height - top - h:.2f} {w:.2f} {h:.2f} re {paint} Q')

    def line(self, x1, y1, x2, y2, color, width=0.5, dash=None):
        pattern = f'[{dash[0]} {dash[1]}] 0 d ' if dash else ''
        self._add(f'q {_rgb(color)} RG {width} w {pattern}{x1:.2f} {self.height - y1:.2f} m {x2:.2f} {self.height - y2:.2f} l S Q')

    def path(self, points, color, width=0.6):
        body = ' '.join(f'{x:.2f} {self.height - y:.2f} {"m" if i == 0 else "l"}' for i, (x, y) in enumerate(points))
        self._add(f'q {_rgb(color)} RG {width} w {body} S Q')

    def polygon(self, points, fill):
        body = ' '.join(f'{x:.2f} {self.height - y:.2f} {"m" if i == 0 else "l"}' for i, (x, y) in enumerate(points))
        self._add(f'q {_rgb(fill)} rg {body} h f Q')

    def text(self, x, top, value, size=8, bold=False, color='#25303B', align='l'):
        encoded = value.encode('cp1252', errors='replace').replace(b'\\', b'\\\\').replace(b'(', b'\\(').replace(b')', b'\\)')
        width = _width(value, size, bold)
        x = x - width if align == 'r' else x - width / 2 if align == 'c' else x
        head = f'BT {_rgb(color)} rg /{"F2" if bold else "F1"} {size} Tf {x:.2f} {self.height - top - size * 0.8:.2f} Td ('.encode('ascii')
        self.ops.append(head + encoded + b') Tj ET')


def _link_points(source, target, side_from, side_to, row_h):
    """Rechtwinklige Linie wie im Diagramm; source und target sind (x, y) der Ankerpunkte."""
    dir_s, dir_t = (1 if side_from == 'F' else -1), (-1 if side_to == 'S' else 1)
    e0, e1, gap = source[0] + dir_s * 4, target[0] + dir_t * 4, 4
    for v in (e0, e1):
        if (v - source[0]) * dir_s >= gap and (v - target[0]) * dir_t >= gap:
            return [source, (v, source[1]), (v, target[1]), target]
    ym = source[1] + row_h / 2 if target[1] > source[1] else source[1] - row_h / 2
    return [source, (e0, source[1]), (e0, ym), (e1, ym), (e1, target[1]), target]


def build_pdf(model) -> bytes:
    options, rows, links = model.get('options', {}), model['rows'], model.get('links', [])
    show_base, show_crit = bool(options.get('baseline')), bool(options.get('critical'))
    page_w, page_h, margin = 842.0, 595.0, 28.0
    row_h, head_h = 13.5, 34.0
    columns = [('Nr.', 22, 'r'), ('Vorgang', 178, 'l'), ('Dauer', 30, 'r'), ('Anfang', 48, 'r'), ('Ende', 48, 'r')]
    table_w = sum(width for _, width, _ in columns) + 6
    gantt_x = margin + table_w + 6
    gantt_w = page_w - margin - gantt_x
    first, last = _range(model)
    scale = gantt_w / max(last - first, 1)
    x_of = lambda day: gantt_x + (day - first) * scale
    top_start = margin + 38
    per_page = int((page_h - margin - 16 - top_start - head_h) // row_h)
    chunks = [rows[i:i + per_page] for i in range(0, len(rows), per_page)]
    title = f"{model.get('projectNumber', '')} · {model['projectName']}".strip(' ·')
    legend = _legend(model)
    pages = []
    today = _day(model['createdAt'])
    span_days = last - first
    for index, chunk in enumerate(chunks):
        page = _Page(page_h)
        pages.append(page)
        page.text(margin, margin - 4, _fit(title, 13, page_w - 2 * margin - 160, True), 13, True)
        page.text(margin, margin + 14, f"Projektplan · Stand {_german(model['createdAt'])}" + ('   ' + ' · '.join(legend) if legend else ''), 8, color='#54616C')
        page.text(page_w - margin, page_h - margin + 6, f'Seite {index + 1} von {len(chunks)}', 8, color='#54616C', align='r')
        table_top, body_top = top_start, top_start + head_h
        page.rect(margin, table_top, page_w - 2 * margin, head_h, fill='#25303B')
        x = margin
        for label, width, align in columns:
            page.text(x + width - 2 if align == 'r' else x + 2, table_top + head_h - 12, label, 8, True, '#FFFFFF', align)
            x += width
        # Zeitachse: Monate oben (bei langen Plänen nur jeder dritte oder zwölfte), Kalenderwochen unten
        month_step = 1 if 30 * scale >= 34 else 3 if 30 * scale >= 12 else 12
        month = None
        for day in range(first, last):
            d = date.fromordinal(day)
            if (d.year, d.month) != month:
                month = (d.year, d.month)
                page.line(x_of(day), table_top + 2, x_of(day), table_top + head_h - 2, '#54616C', 0.4)
                if (d.month - 1) % month_step == 0:
                    page.text(x_of(day) + 2, table_top + 3, d.strftime('%m/%Y'), 7, True, '#FFFFFF')
            if span_days <= 200 and d.weekday() == 0:
                page.text(x_of(day) + 1, table_top + head_h - 12, str(d.isocalendar()[1]), 6, False, '#FFFFFF')
        for gate in model.get('gates', []):
            gx = x_of(_day(gate['date']))
            page.polygon([(gx, table_top + head_h - 5), (gx + 3, table_top + head_h - 2), (gx, table_top + head_h + 1), (gx - 3, table_top + head_h - 2)], GATE)
        body_h = row_h * len(chunk)
        position = {}
        for at, row in enumerate(chunk):
            top = body_top + at * row_h
            position[row['nr']] = at
            if at % 2:
                page.rect(margin, top, page_w - 2 * margin, row_h, fill=STRIPE)
        month = None
        for day in range(first, last):
            d = date.fromordinal(day)
            if (d.year, d.month) != month:
                month = (d.year, d.month)
                page.line(x_of(day), body_top, x_of(day), body_top + body_h, GRID, 0.3)
        for gate in model.get('gates', []):
            gx = x_of(_day(gate['date']))
            page.line(gx, body_top, gx, body_top + body_h, GATE, 0.8, (3, 2))
            page.text(gx + 2, body_top + body_h + 1, gate['label'].replace('Gate ', 'G'), 6, True, '#7A5A00')
        if first <= today < last:
            tx = x_of(today) + scale / 2
            page.line(tx, body_top, tx, body_top + body_h, TODAY, 0.9)
        for at, row in enumerate(chunk):
            top = body_top + at * row_h
            critical = show_crit and row.get('critical')
            color = '#9E0C26' if critical else '#25303B'
            bold = row['kind'] == 'summary'
            values = [str(row['nr']), None, f"{row['duration']} d", _german(row['start']), _german(row['end'])]
            x = margin
            for (label, width, align), value in zip(columns, values):
                if value is None:
                    indent = row['level'] * 7
                    page.text(x + 3 + indent, top + 3, _fit(row['name'], 7.5, width - 6 - indent, bold), 7.5, bold, color)
                else:
                    page.text(x + width - 2, top + 3, value, 7.5, bold, color, 'r')
                x += width
            start, end = _day(row['start']), _day(row['end']) + 1
            x1, x2 = x_of(start), max(x_of(end), x_of(start) + 2)
            mid = top + row_h / 2
            if show_base and row.get('baselineStart'):
                b1, b2 = x_of(_day(row['baselineStart'])), max(x_of(_day(row['baselineEnd']) + 1), x_of(_day(row['baselineStart'])) + 2)
                page.rect(b1, top + row_h - 3.2, b2 - b1, 2, fill=BASELINE)
            if row['kind'] == 'milestone':
                cx = x1 + scale / 2
                page.polygon([(cx, mid - 4.5), (cx + 4.5, mid), (cx, mid + 4.5), (cx - 4.5, mid)], CRITICAL)
            elif row['kind'] == 'summary':
                fill = CRITICAL if critical else SUMMARY
                page.rect(x1, mid - 3, x2 - x1, 3.2, fill=fill)
                page.polygon([(x1, mid), (x1 + 3.5, mid), (x1, mid + 4)], fill)
                page.polygon([(x2, mid), (x2 - 3.5, mid), (x2, mid + 4)], fill)
            else:
                page.rect(x1, mid - 3.5, x2 - x1, 7, fill=CRITICAL if critical else BAR)
                done = (x2 - x1) * row['percent'] / 100
                if done > 0:
                    page.rect(x1, mid + 0.8, done, 1.8, fill='#FFFFFF')
        # Verknüpfungen: nur wenn beide Vorgänge auf dieser Seite stehen
        by_nr = {row['nr']: row for row in chunk}
        for link in links:
            if link['from'] not in by_nr or link['to'] not in by_nr:
                continue
            src, dst = by_nr[link['from']], by_nr[link['to']]
            side_from, side_to = link['type'][0], link['type'][1]

            def anchor(row, side):
                at = position[row['nr']]
                y = body_top + at * row_h + row_h / 2
                if row['kind'] == 'milestone':
                    cx = x_of(_day(row['start'])) + scale / 2
                    return (cx - 5 if side == 'S' else cx + 5, y)
                return (x_of(_day(row['start'])) if side == 'S' else max(x_of(_day(row['end']) + 1), x_of(_day(row['start'])) + 2), y)
            points = _link_points(anchor(src, side_from), anchor(dst, side_to), side_from, side_to, row_h)
            hot = show_crit and link.get('critical')
            color = CRITICAL if hot else '#54616C'
            page.path(points, color, 0.9 if hot else 0.5)
            tip, before = points[-1], points[-2]
            direction = 1 if tip[0] >= before[0] else -1
            page.polygon([tip, (tip[0] - direction * 3, tip[1] - 1.6), (tip[0] - direction * 3, tip[1] + 1.6)], color)
        page.rect(margin, table_top, page_w - 2 * margin, head_h + body_h, stroke=GRID, width=0.5)
    return _assemble(pages, page_w, page_h, f'Projektplan {title}')


def _assemble(pages, width, height, title) -> bytes:
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    add(b'')  # 1 Katalog (später)
    add(b'')  # 2 Seitenbaum (später)
    add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    clean_title = title.encode('cp1252', errors='replace').replace(b'\\', b'\\\\').replace(b'(', b'\\(').replace(b')', b'\\)')
    info = add(b'<< /Title (' + clean_title + b') /Producer (Kapazitaetsplanung) >>')
    kids = []
    for page in pages:
        stream = zlib.compress(b'\n'.join(page.ops))
        content = add(b'<< /Length %d /Filter /FlateDecode >>\nstream\n' % len(stream) + stream + b'\nendstream')
        kids.append(add(b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.0f %.0f] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>' % (width, height, content)))
    objects[0] = b'<< /Type /Catalog /Pages 2 0 R >>'
    objects[1] = b'<< /Type /Pages /Kids [' + b' '.join(b'%d 0 R' % kid for kid in kids) + b'] /Count %d >>' % len(kids)
    out = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b'%d 0 obj\n' % number + body + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objects) + 1)
    for offset in offsets:
        out += b'%010d 00000 n \n' % offset
    out += b'trailer\n<< /Size %d /Root 1 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objects) + 1, info, xref)
    return bytes(out)


# ------------------------------------------------------------------------- MS Project (MSPDI-XML)
_XML_INVALID = re.compile('[^\x09\x0a\x0d\x20-\ud7ff\ue000-\ufffd]')
_MSP_TYPE = {'FF': 0, 'FS': 1, 'SF': 2, 'SS': 3}  # Verknüpfungsarten im Microsoft-Project-XML
_MSP_NS = 'http://schemas.microsoft.com/project'


def _xml(value) -> str:
    from xml.sax.saxutils import escape
    return escape(_XML_INVALID.sub('', str(value)))


def _work_days(start: str, end: str) -> int:
    first, last = _day(start), _day(end)
    return max(sum(1 for day in range(first, last + 1) if date.fromordinal(day).weekday() < 5), 0)


def _duration(days: int) -> str:
    return f'PT{days * 8}H0M0S'  # 8 Arbeitsstunden je Tag, wie im Standardkalender unten


def build_mspdi(model) -> bytes:
    """Microsoft-Project-XML (MSPDI). Microsoft Project öffnet die Datei über Datei › Öffnen; das Binärformat .mpp wird nicht erzeugt."""
    options, rows, links = model.get('options', {}), model['rows'], model.get('links', [])
    include_base, include_crit = options.get('baseline'), options.get('critical')
    title = f"{model.get('projectNumber', '')} {model['projectName']}".strip()
    start = min(row['start'] for row in rows)
    finish = max(row['end'] for row in rows)
    by_target: dict[int, list[dict]] = {}
    for link in links:
        by_target.setdefault(link['to'], []).append(link)
    out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', f'<Project xmlns="{_MSP_NS}">',
           '<SaveVersion>12</SaveVersion>', f'<Name>{_xml(title)}</Name>', f'<Title>{_xml(title)}</Title>',
           f"<CreationDate>{model['createdAt']}T08:00:00</CreationDate>", '<ScheduleFromStart>1</ScheduleFromStart>',
           f'<StartDate>{start}T08:00:00</StartDate>', f'<FinishDate>{finish}T17:00:00</FinishDate>', '<CalendarUID>1</CalendarUID>',
           '<DefaultStartTime>08:00:00</DefaultStartTime>', '<DefaultFinishTime>17:00:00</DefaultFinishTime>',
           '<MinutesPerDay>480</MinutesPerDay>', '<MinutesPerWeek>2400</MinutesPerWeek>', '<DaysPerMonth>20</DaysPerMonth>',
           '<DurationFormat>7</DurationFormat>', '<WeekStartDay>1</WeekStartDay>',
           '<Calendars><Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>',
           '<WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>']
    for day_type in range(2, 7):
        out.append(f'<WeekDay><DayType>{day_type}</DayType><DayWorking>1</DayWorking><WorkingTimes>'
                   '<WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>'
                   '<WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>')
    out.append('<WeekDay><DayType>7</DayType><DayWorking>0</DayWorking></WeekDay></WeekDays></Calendar></Calendars><Tasks>')
    counters = [0] * (MAX_LEVEL + 2)
    for row in rows:
        level = row['level']
        counters[level] += 1
        for deeper in range(level + 1, len(counters)):
            counters[deeper] = 0
        outline = '.'.join(str(counters[i]) for i in range(level + 1))
        milestone = row['kind'] == 'milestone'
        days = 0 if milestone else max(_work_days(row['start'], row['end']), 1)
        out.append(f"<Task><UID>{row['nr']}</UID><ID>{row['nr']}</ID><Name>{_xml(row['name'])}</Name><Type>1</Type><IsNull>0</IsNull>"
                   f"<WBS>{outline}</WBS><OutlineNumber>{outline}</OutlineNumber><OutlineLevel>{level + 1}</OutlineLevel><Priority>500</Priority>"
                   f"<Start>{row['start']}T08:00:00</Start><Finish>{row['end']}T{'08' if milestone else '17'}:00:00</Finish>"
                   f"<Duration>{_duration(days)}</Duration><DurationFormat>7</DurationFormat><Milestone>{int(milestone)}</Milestone>"
                   f"<Summary>{int(row['kind'] == 'summary')}</Summary><Critical>{int(bool(include_crit and row.get('critical')))}</Critical>"
                   f"<PercentComplete>{row['percent']}</PercentComplete><ConstraintType>0</ConstraintType>")
        for link in by_target.get(row['nr'], []):
            out.append(f"<PredecessorLink><PredecessorUID>{link['from']}</PredecessorUID><Type>{_MSP_TYPE[link['type']]}</Type>"
                       f"<CrossProject>0</CrossProject><LinkLag>{link.get('lag', 0) * 4800}</LinkLag><LagFormat>7</LagFormat></PredecessorLink>")
        if include_base and row.get('baselineStart'):
            base_days = 0 if milestone else max(_work_days(row['baselineStart'], row['baselineEnd']), 1)
            out.append(f"<Baseline><Number>0</Number><Start>{row['baselineStart']}T08:00:00</Start>"
                       f"<Finish>{row['baselineEnd']}T{'08' if milestone else '17'}:00:00</Finish><Duration>{_duration(base_days)}</Duration>"
                       '<DurationFormat>7</DurationFormat></Baseline>')
        out.append('</Task>')
    out.append('</Tasks></Project>')
    return '\n'.join(out).encode('utf-8')


def build(model) -> tuple[bytes, str, str]:
    """Liefert (Inhalt, Dateiname, Medientyp)."""
    if model['format'] == 'xlsx':
        return build_xlsx(model), file_name(model), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    if model['format'] == 'xml':
        return build_mspdi(model), file_name(model), 'application/xml'
    return build_pdf(model), file_name(model), 'application/pdf'
