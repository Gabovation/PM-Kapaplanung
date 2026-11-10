// Month calendar for `data-pt-date` (pick a day) and `data-pt-week` (pick an ISO week): Monday first,
// ISO week numbers in the first column, month and weekday names from Intl in the page language.
// Keyboard: arrows move by day/week, PageUp/PageDown by month, Home/End to the week's start/end,
// Enter or Space picks, Escape closes. All dates are UTC ISO strings, never local Date objects.
const DAY = 86400000;

const language = () => document.documentElement.lang || navigator.language || 'en';
const toIso = (time) => new Date(time).toISOString().slice(0, 10);
const timeOf = (iso) => Date.parse(`${iso}T00:00:00Z`);
const capitalize = (text) => text.charAt(0).toLocaleUpperCase(language()) + text.slice(1);

export function isoWeekOf(iso) {
  const date = new Date(timeOf(iso));
  const thursday = new Date(date.getTime() + (3 - ((date.getUTCDay() + 6) % 7)) * DAY);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY / 7) + 1;
  return { year, week };
}

export function isoWeekStart(year, week) {
  const fourth = Date.UTC(year, 0, 4);
  const monday = fourth - ((new Date(fourth).getUTCDay() + 6) % 7) * DAY;
  return toIso(monday + (week - 1) * 7 * DAY);
}

// "2026-W46", "W46 2026", "46/2026", "46" (in `year`) or a date in that week; null when invalid.
export function parsePolytecWeek(text, year, parseDate) {
  const value = String(text ?? '').trim();
  let match;
  let result = null;
  if ((match = value.match(/^(\d{4})-?W(\d{1,2})$/i))) result = { year: Number(match[1]), week: Number(match[2]) };
  else if ((match = value.match(/^\D*(\d{1,2})\D+(\d{4})$/))) result = { year: Number(match[2]), week: Number(match[1]) };
  else if ((match = value.match(/^\D*(\d{1,2})$/)) && year) result = { year, week: Number(match[1]) };
  else {
    const iso = parseDate?.(value);
    if (iso) result = isoWeekOf(iso);
  }
  if (!result || result.week < 1 || isoWeekOf(isoWeekStart(result.year, result.week)).week !== result.week) return null;
  return `${result.year}-W${String(result.week).padStart(2, '0')}`;
}

function relative(value, unit, fallback) {
  try {
    return capitalize(new Intl.RelativeTimeFormat(language(), { numeric: 'auto' }).format(value, unit));
  } catch {
    return fallback;
  }
}

function weekHeading() {
  try {
    return capitalize(new Intl.DisplayNames(language(), { type: 'dateTimeField' }).of('weekOfYear'));
  } catch {
    return 'Week';
  }
}

function icon(name) {
  return `<svg class="pt-icon" aria-hidden="true" focusable="false"><use href="#pt-icon-${name}"></use></svg>`;
}

// Returns the calendar element; `onPick(iso)` receives the day (mode "date") or the week's Monday
// (mode "week"); `onClose(restoreFocus)` runs on Escape, a pick or focus leaving the calendar.
export function createPolytecCalendar({ mode = 'date', value = '', min = '', max = '', label = '', onPick, onClose }) {
  const today = toIso(Date.now() - new Date().getTimezoneOffset() * 60000);
  const week = mode === 'week';
  let focused = value || today;
  const root = document.createElement('div');
  root.className = `pt-calendar${week ? ' pt-calendar--week' : ''}`;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', label);
  const months = new Intl.DateTimeFormat(language(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const days = new Intl.DateTimeFormat(language(), { weekday: 'short', timeZone: 'UTC' });
  const longDays = new Intl.DateTimeFormat(language(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const weekdayNames = Array.from({ length: 7 }, (_, i) => days.format(Date.UTC(2024, 0, 1 + i)).replace('.', '').slice(0, 2));
  root.innerHTML = `
    <div class="pt-calendar__header">
      <strong class="pt-calendar__title" aria-live="polite"></strong>
      <button type="button" class="pt-calendar__nav" data-step="-1" aria-label="${relative(-1, 'month', 'Previous month')}" title="${relative(-1, 'month', 'Previous month')}">${icon('chevron-left')}</button>
      <button type="button" class="pt-calendar__nav" data-step="1" aria-label="${relative(1, 'month', 'Next month')}" title="${relative(1, 'month', 'Next month')}">${icon('chevron-right')}</button>
    </div>
    <table class="pt-calendar__grid" role="grid">
      <thead><tr><th scope="col" class="pt-calendar__week">${weekHeading()}</th>${weekdayNames.map((name) => `<th scope="col">${name}</th>`).join('')}</tr></thead>
      <tbody></tbody>
    </table>
    <div class="pt-calendar__footer"><button type="button" class="pt-button pt-button--secondary pt-calendar__today">${week ? relative(0, 'week', 'This week') : relative(0, 'day', 'Today')}</button></div>`;
  const title = root.querySelector('.pt-calendar__title');
  const body = root.querySelector('tbody');
  const allowed = (iso) => (!min || iso >= min) && (!max || iso <= max);
  const selectedWeek = week && value ? isoWeekOf(value) : null;

  const render = (focus = false) => {
    const first = new Date(timeOf(focused));
    first.setUTCDate(1);
    title.textContent = capitalize(months.format(first));
    const start = first.getTime() - ((first.getUTCDay() + 6) % 7) * DAY;
    const rows = [];
    for (let row = 0; row < 6; row += 1) {
      const monday = toIso(start + row * 7 * DAY);
      const number = isoWeekOf(monday);
      const chosen = selectedWeek && number.week === selectedWeek.week && number.year === selectedWeek.year;
      const cells = [];
      for (let column = 0; column < 7; column += 1) {
        const iso = toIso(start + (row * 7 + column) * DAY);
        const classes = ['pt-calendar__day'];
        if (iso.slice(0, 7) !== toIso(first.getTime()).slice(0, 7)) classes.push('is-outside');
        if (iso === today) classes.push('is-today');
        if (!week && iso === value) classes.push('is-selected');
        cells.push(`<td><button type="button" class="${classes.join(' ')}" data-date="${iso}" tabindex="${iso === focused ? 0 : -1}"${!week && iso === value ? ' aria-pressed="true"' : ''}${allowed(iso) ? '' : ' disabled'} aria-label="${longDays.format(timeOf(iso))}">${Number(iso.slice(8))}</button></td>`);
      }
      rows.push(`<tr${chosen ? ' class="is-selected" aria-selected="true"' : ''}><th scope="row" class="pt-calendar__week">${number.week}</th>${cells.join('')}</tr>`);
    }
    body.innerHTML = rows.join('');
    if (focus) body.querySelector(`[data-date="${focused}"]`)?.focus();
  };
  const move = (iso) => {
    const sameMonth = iso.slice(0, 7) === focused.slice(0, 7);
    focused = iso;
    const button = body.querySelector(`[data-date="${iso}"]`);
    if (sameMonth && button) {
      body.querySelectorAll('[tabindex="0"]').forEach((other) => { other.tabIndex = -1; });
      button.tabIndex = 0;
      button.focus();
    } else render(true);
  };
  const shiftMonth = (step) => {
    const date = new Date(timeOf(focused));
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + step);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
    return toIso(date.getTime());
  };
  const pick = (iso) => {
    if (!allowed(iso)) return;
    onPick(week ? isoWeekStart(isoWeekOf(iso).year, isoWeekOf(iso).week) : iso);
  };

  root.addEventListener('click', (event) => {
    const nav = event.target.closest('.pt-calendar__nav');
    const day = event.target.closest('[data-date]');
    if (nav) {
      focused = shiftMonth(Number(nav.dataset.step));
      render();
    } else if (day) pick(day.dataset.date);
    else if (event.target.closest('.pt-calendar__today')) pick(today);
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
      return;
    }
    if (!event.target.closest('[data-date]')) return;
    const time = timeOf(focused);
    const weekday = (new Date(time).getUTCDay() + 6) % 7;
    const target = {
      ArrowLeft: () => toIso(time - DAY), ArrowRight: () => toIso(time + DAY),
      ArrowUp: () => toIso(time - 7 * DAY), ArrowDown: () => toIso(time + 7 * DAY),
      Home: () => toIso(time - weekday * DAY), End: () => toIso(time + (6 - weekday) * DAY),
      PageUp: () => shiftMonth(-1), PageDown: () => shiftMonth(1),
    }[event.key];
    if (!target) return;
    event.preventDefault();
    move(target());
  });
  root.addEventListener('focusout', (event) => {
    if (event.relatedTarget && !root.contains(event.relatedTarget)) onClose(false);
  });
  render();
  root.focusCurrent = () => body.querySelector('[tabindex="0"]')?.focus();
  return root;
}
