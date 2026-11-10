import { initTableEditors } from './table-editor.js';
import { initListWorkspaces, refreshList } from './list-workspace.js';
import { initListViews } from './list-views.js';
import { initScheduleBoards } from './schedule-board.js';
import { initTimeBoards } from './time-board.js';
import { initPlanningGrids } from './planning-grid.js';
import { createPolytecCalendar, isoWeekOf, isoWeekStart, parsePolytecWeek } from './date-picker.js';

const BUSY_SELECTOR = 'button[type="submit"], input[type="submit"]';

function setButtonLabel(control, busy) {
  if (!control.dataset.ptLoadingLabel) return;
  if (control instanceof HTMLInputElement) {
    if (busy) {
      control.dataset.ptOriginalLabel = control.value;
      control.value = control.dataset.ptLoadingLabel;
    } else if (control.dataset.ptOriginalLabel) {
      control.value = control.dataset.ptOriginalLabel;
      delete control.dataset.ptOriginalLabel;
    }
    return;
  }
  const label = control.querySelector?.('[data-pt-button-label]');
  const target = label || control;
  if (busy) {
    control.dataset.ptOriginalLabel = target.textContent;
    target.textContent = control.dataset.ptLoadingLabel;
  } else if (control.dataset.ptOriginalLabel) {
    target.textContent = control.dataset.ptOriginalLabel;
    delete control.dataset.ptOriginalLabel;
  }
}

// One button: spinner, loading label, same width, not clickable until reset. For buttons that are
// no form submit (e.g. "Send e-mail"); setPolytecBusy() does this for a form's submit buttons.
export function setPolytecButtonBusy(control, busy = true) {
  if (busy === (control.getAttribute('aria-busy') === 'true')) return;
  if (busy) {
    control.style.minInlineSize = `${control.offsetWidth}px`;
    control.dataset.ptWasAriaDisabled = control.getAttribute('aria-disabled') || '';
    control.setAttribute('aria-disabled', 'true');
    control.setAttribute('aria-busy', 'true');
  } else {
    control.style.removeProperty('min-inline-size');
    if (control.dataset.ptWasAriaDisabled) control.setAttribute('aria-disabled', control.dataset.ptWasAriaDisabled);
    else control.removeAttribute('aria-disabled');
    delete control.dataset.ptWasAriaDisabled;
    control.removeAttribute('aria-busy');
  }
  setButtonLabel(control, busy);
}

export function setPolytecBusy(form, busy = true) {
  if (busy) form.setAttribute('aria-busy', 'true');
  else form.removeAttribute('aria-busy');
  form.querySelectorAll(BUSY_SELECTOR).forEach((control) => setPolytecButtonBusy(control, busy));
}

export function resetPolytecBusy(form) {
  setPolytecBusy(form, false);
}

function resumeAction(element) {
  element.dataset.ptConfirmedOnce = 'true';
  element.click();
  queueMicrotask(() => delete element.dataset.ptConfirmedOnce);
}

function requestConfirmation(element, title, message) {
  const dialog = document.querySelector('[data-pt-confirm-dialog]');
  if (!dialog || typeof dialog.showModal !== 'function') {
    if (window.confirm(message)) resumeAction(element);
    return;
  }

  dialog.querySelector('[data-pt-confirm-title]').textContent = title;
  dialog.querySelector('[data-pt-confirm-message]').textContent = message;
  dialog._ptPendingAction = element;
  dialog.showModal();
}

function initializeConfirmationDialog(root) {
  const dialog = root.querySelector('[data-pt-confirm-dialog]');
  if (!dialog) return;
  dialog.addEventListener('close', () => {
    const pending = dialog._ptPendingAction;
    dialog._ptPendingAction = null;
    if (dialog.returnValue === 'confirm' && pending) resumeAction(pending);
  });
}

const HASH_NAV_SELECTOR = '.ops-navigation-item[href^="#"], .ops-mobile-navigation__item[href^="#"]';

// Keeps rail/bottom navigation "active" state in sync on single-page, anchor-based
// shells (e.g. the static catalog): applies on click and while scrolling past sections.
function initHashNavigation(root) {
  const items = Array.from(root.querySelectorAll(HASH_NAV_SELECTOR));
  if (!items.length) return;

  const setActive = (hash) => {
    items.forEach((item) => {
      const isActive = item.getAttribute('href') === hash;
      item.classList.toggle('is-active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  };

  root.addEventListener('click', (event) => {
    const link = event.target.closest?.(HASH_NAV_SELECTOR);
    if (link) setActive(link.getAttribute('href'));
  });

  if (typeof IntersectionObserver === 'undefined') return;
  const sections = items
    .map((item) => document.getElementById(item.getAttribute('href').slice(1)))
    .filter(Boolean);
  if (!sections.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(`#${visible.target.id}`);
    },
    { rootMargin: '-35% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
  );
  sections.forEach((section) => observer.observe(section));
}

// Floating layers (select popups, help bubbles) are placed against the viewport with
// position: fixed, so a scrolling table, dialog body or work area never clips them.
const FLOAT_MARGIN = 8;
const FLOAT_GAP = 4;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(value, maximum));
}

// Puts `layer` below `anchor` (above when there is more room there) and inside the viewport.
// `align` "start" lines up the left edges, "end" the right edges. Returns the height available.
function placeFloating(anchor, layer, { align = 'start', fit = false } = {}) {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  if (fit) {
    layer.style.setProperty('--pt-float-min-width', `${Math.round(rect.width)}px`);
    layer.style.removeProperty('--pt-float-max-height');
  }
  const width = Math.min(layer.offsetWidth, viewportWidth - 2 * FLOAT_MARGIN);
  const height = layer.offsetHeight;
  const below = viewportHeight - rect.bottom - FLOAT_GAP - FLOAT_MARGIN;
  const above = rect.top - FLOAT_GAP - FLOAT_MARGIN;
  const upwards = height > below && above > below;
  const room = Math.max(0, upwards ? above : below);
  const shown = Math.min(height, room);
  const preferred = align === 'end' ? rect.right - width : rect.left;
  layer.style.setProperty('--pt-float-x', `${Math.round(clamp(preferred, FLOAT_MARGIN, viewportWidth - FLOAT_MARGIN - width))}px`);
  layer.style.setProperty('--pt-float-y', `${Math.round(upwards ? rect.top - FLOAT_GAP - shown : rect.bottom + FLOAT_GAP)}px`);
  if (fit) layer.style.setProperty('--pt-float-max-height', `${Math.floor(room)}px`);
  return room;
}

// Long option lists get a search field (from this many options; data-pt-search="off" never,
// data-pt-search always). Matching ignores case and accents and finds text anywhere in a label.
const SELECT_SEARCH_MIN_OPTIONS = 10;
const foldText = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Replaces native <select class="pt-select"> with a custom-styled trigger + listbox.
// Native <select> popups are drawn by the OS/browser and ignore CSS colors, so this is the
// only way to keep dropdown option lists on-palette. The original <select> stays in the DOM
// (visually hidden) so form submission, `required`/`aria-invalid`, and no-JS fallback all work.
// `<select multiple>` becomes a multi-select: options carry a check box and toggle on click,
// Space or Enter while the list stays open; the trigger lists the chosen labels or shows
// `data-pt-placeholder` when none is chosen; "Clear" (`data-pt-clear-label`) empties the choice.
function enhanceSelect(select) {
  if (select.dataset.ptEnhanced) return;
  select.dataset.ptEnhanced = 'true';
  const multiple = select.multiple;

  const wrap = document.createElement('div');
  wrap.className = 'pt-select-wrap';
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);
  select.classList.add('pt-select--enhanced');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const triggerId = select.id ? `${select.id}-trigger` : `pt-select-trigger-${Math.random().toString(36).slice(2, 9)}`;
  const listboxId = select.id ? `${select.id}-listbox` : `pt-select-listbox-${Math.random().toString(36).slice(2, 9)}`;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'pt-select pt-select-trigger';
  trigger.id = triggerId;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', listboxId);
  if (select.hasAttribute('aria-describedby')) trigger.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
  if (select.hasAttribute('aria-invalid')) trigger.setAttribute('aria-invalid', select.getAttribute('aria-invalid'));
  if (select.disabled) trigger.disabled = true;
  trigger.innerHTML = '<span class="pt-select-trigger__label"></span><svg class="pt-select-trigger__caret" aria-hidden="true" focusable="false"><use href="#pt-icon-chevron-down"></use></svg>';
  wrap.insertBefore(trigger, select);

  // The popup holds the optional search field, the listbox and the "no match" note.
  const popup = document.createElement('div');
  popup.className = 'pt-select-popup';
  popup.hidden = true;

  const search = document.createElement('input');
  search.className = 'pt-input pt-select-search';
  search.type = 'search';
  search.autocomplete = 'off';
  search.spellcheck = false;
  search.setAttribute('role', 'combobox');
  search.setAttribute('aria-autocomplete', 'list');
  search.setAttribute('aria-expanded', 'true');
  search.setAttribute('aria-controls', listboxId);
  search.setAttribute('aria-label', select.dataset.ptSearchLabel || 'Search');
  search.placeholder = select.dataset.ptSearchLabel || 'Search';

  const listbox = document.createElement('ul');
  listbox.className = 'pt-select-listbox';
  listbox.id = listboxId;
  listbox.setAttribute('role', 'listbox');
  listbox.tabIndex = -1;
  // Required belongs to the listbox, not the button that opens it (ARIA 1.2).
  if (select.required) listbox.setAttribute('aria-required', 'true');
  listbox.setAttribute('aria-labelledby', triggerId);
  if (multiple) listbox.setAttribute('aria-multiselectable', 'true');

  const empty = document.createElement('p');
  empty.className = 'pt-select-empty';
  empty.setAttribute('role', 'status');
  empty.hidden = true;

  // Multi-select only: empties the choice in one click.
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'pt-select-clear';
  clear.textContent = select.dataset.ptClearLabel || 'Clear';
  clear.hidden = true;

  popup.append(search, listbox, empty);
  if (multiple) popup.append(clear);
  wrap.appendChild(popup);

  const labelEl = document.querySelector(`label[for="${select.id}"]`);
  if (labelEl) labelEl.setAttribute('for', triggerId);

  // <option data-icon="name"> shows a sprite icon in the listbox and in the trigger.
  const svgIcon = (name, className = 'pt-icon') => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#pt-icon-${name}`);
    svg.appendChild(use);
    return svg;
  };
  const optionContent = (option) => {
    const fragment = document.createDocumentFragment();
    if (option.dataset.icon) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'pt-icon');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#pt-icon-${option.dataset.icon}`);
      svg.appendChild(use);
      fragment.appendChild(svg);
    }
    fragment.appendChild(document.createTextNode(option.text));
    return fragment;
  };

  // Applications rebuild option lists and assign `select.value` at runtime, so the
  // listbox is derived from the native element on demand rather than snapshotted once.
  let options = [];
  const buildOptions = () => {
    listbox.replaceChildren();
    options = Array.from(select.options).map((option, index) => {
      const item = document.createElement('li');
      item.className = 'pt-select-option';
      item.id = `${listboxId}-option-${index}`;
      item.setAttribute('role', 'option');
      item.dataset.value = option.value;
      item.replaceChildren(optionContent(option));
      if (multiple) {
        const box = document.createElement('span');
        box.className = 'pt-select-check';
        box.appendChild(svgIcon('check', 'pt-select-check__mark'));
        item.prepend(box);
      }
      if (option.disabled) item.setAttribute('aria-disabled', 'true');
      listbox.appendChild(item);
      return item;
    });
  };

  let activeIndex = select.selectedIndex >= 0 ? select.selectedIndex : 0;
  const isOpen = () => !popup.hidden;
  const searchable = () => (select.dataset.ptSearch === undefined
    ? select.options.length >= SELECT_SEARCH_MIN_OPTIONS
    : select.dataset.ptSearch !== 'off');
  // Disabled options are shown but can never be chosen; filtered-out ones are skipped too.
  const choosable = (index) => Boolean(options[index]) && !options[index].hidden && !select.options[index]?.disabled;
  // The element that holds focus while the popup is open carries aria-activedescendant.
  const focusHolder = () => (searchable() ? search : listbox);

  const syncLabel = () => {
    const label = trigger.querySelector('.pt-select-trigger__label');
    if (multiple) {
      // One choice shows like a single select (with its icon); several as a comma list that ends
      // in "…" when it does not fit; none as the placeholder.
      const chosen = Array.from(select.selectedOptions);
      if (chosen.length === 1) label.replaceChildren(optionContent(chosen[0]));
      else label.textContent = chosen.length ? chosen.map((option) => option.text).join(', ') : (select.dataset.ptPlaceholder || '');
      trigger.classList.toggle('is-placeholder', chosen.length === 0);
      trigger.title = chosen.length > 1 ? label.textContent : '';
      options.forEach((item, index) => item.setAttribute('aria-selected', String(select.options[index].selected)));
      clear.hidden = chosen.length === 0;
    } else {
      const selected = select.options[select.selectedIndex];
      label.replaceChildren(selected ? optionContent(selected) : document.createTextNode(''));
      options.forEach((item, index) => item.setAttribute('aria-selected', String(index === select.selectedIndex)));
    }
    trigger.disabled = select.disabled;
    if (select.hasAttribute('aria-invalid')) trigger.setAttribute('aria-invalid', select.getAttribute('aria-invalid'));
    else trigger.removeAttribute('aria-invalid');
  };

  const resync = () => {
    buildOptions();
    syncLabel();
  };

  // Keep trigger and listbox aligned with the native element: option churn, `selected`,
  // `disabled` and `aria-invalid` are observed; a plain `select.value = x` is picked up on
  // the next `change`/`input` event or an explicit `pt:select-sync` event from the app.
  const observer = new MutationObserver((records) => {
    const structural = records.some((record) => record.type === 'childList' || record.target !== select);
    if (structural) resync();
    else syncLabel();
  });
  observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['selected', 'disabled', 'aria-invalid', 'value'] });
  select.addEventListener('change', syncLabel);
  select.addEventListener('input', syncLabel);
  select.addEventListener('pt:select-sync', resync);
  // Direct `select.value = …` / `select.selectedIndex = …` writes fire no event, so the
  // enhanced element gets instance-level accessors that forward to the prototype and resync.
  for (const property of ['value', 'selectedIndex']) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, property);
    if (!descriptor?.set || !descriptor.get) continue;
    Object.defineProperty(select, property, {
      configurable: true,
      get() { return descriptor.get.call(this); },
      set(next) { descriptor.set.call(this, next); syncLabel(); },
    });
  }
  buildOptions();

  // Scrolls only the listbox, never the page or a table around the select.
  const keepInView = (item) => {
    if (!item) return;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < listbox.scrollTop) listbox.scrollTop = top;
    else if (bottom > listbox.scrollTop + listbox.clientHeight) listbox.scrollTop = bottom - listbox.clientHeight;
  };

  const setActive = (index) => {
    activeIndex = index;
    options.forEach((item, i) => item.classList.toggle('is-active', i === activeIndex));
    const item = options[activeIndex];
    if (item && choosable(activeIndex)) focusHolder().setAttribute('aria-activedescendant', item.id);
    else focusHolder().removeAttribute('aria-activedescendant');
    keepInView(item);
  };

  // Next choosable option from `start` in direction `step`; stays put at either end.
  const step = (start, direction) => {
    for (let index = start + direction; index >= 0 && index < options.length; index += direction) {
      if (choosable(index)) return index;
    }
    return choosable(start) ? start : -1;
  };
  const first = () => step(-1, 1);
  const last = () => step(options.length, -1);

  const place = () => {
    if (!isOpen()) return;
    const rect = trigger.getBoundingClientRect();
    // A trigger scrolled out of sight takes its list with it.
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      close();
      return;
    }
    placeFloating(trigger, popup, { fit: true });
  };
  const onScroll = (event) => {
    if (!popup.contains(event.target)) place();
  };

  const filter = () => {
    const query = foldText(search.value.trim());
    let visible = 0;
    options.forEach((item, index) => {
      item.hidden = Boolean(query) && !foldText(select.options[index].text).includes(query);
      if (!item.hidden) visible += 1;
    });
    empty.textContent = select.dataset.ptSearchEmpty || 'No matches';
    empty.hidden = visible > 0;
    setActive(choosable(activeIndex) ? activeIndex : first());
    place();
  };

  const open = (query = '') => {
    if (trigger.disabled) return;
    const withSearch = searchable();
    search.hidden = !withSearch;
    search.value = query;
    popup.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    options.forEach((item) => { item.hidden = false; });
    empty.hidden = true;
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    place();
    setActive(choosable(select.selectedIndex) ? select.selectedIndex : first());
    if (withSearch) {
      search.focus({ preventScroll: true });
      if (query) filter();
    } else listbox.focus({ preventScroll: true });
  };

  function close({ focusTrigger = false } = {}) {
    if (!isOpen()) return;
    popup.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    search.removeAttribute('aria-activedescendant');
    listbox.removeAttribute('aria-activedescendant');
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', place);
    if (focusTrigger) trigger.focus();
  }

  const announceChange = () => {
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const commit = (index) => {
    if (!choosable(index)) return;
    if (multiple) {
      // Toggles one option; the list stays open for the next choice.
      select.options[index].selected = !select.options[index].selected;
      announceChange();
      syncLabel();
      setActive(index);
      // A mouse click on an option would leave the focus nowhere; keep it where the keys work.
      focusHolder().focus({ preventScroll: true });
      return;
    }
    if (select.selectedIndex !== index) {
      select.selectedIndex = index;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('input', { bubbles: true }));
    }
    syncLabel();
    close({ focusTrigger: true });
  };

  // Keys shared by the trigger and the search field while the popup is open.
  const navigate = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = step(activeIndex, event.key === 'ArrowDown' ? 1 : -1);
      setActive(next >= 0 ? next : first());
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commit(activeIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();  // an Escape for the list must not also close a dialog around it
      close({ focusTrigger: true });
    } else if (event.key === 'Tab') {
      close();
    } else {
      return false;
    }
    return true;
  };

  trigger.addEventListener('click', () => {
    if (isOpen()) close({ focusTrigger: true });
    else open();
  });

  const onSelectKeydown = (event) => {
    const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (!isOpen()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        open();
      } else if (printable && searchable()) {
        // Typing on a closed searchable select starts the search with that character.
        event.preventDefault();
        open(event.key);
      }
      return;
    }
    if (navigate(event)) return;
    if (event.key === ' ') {
      event.preventDefault();
      commit(activeIndex);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(first());
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(last());
    } else if (printable) {
      const key = foldText(event.key);
      const starts = (index) => choosable(index) && foldText(options[index].textContent).startsWith(key);
      const after = options.findIndex((_item, index) => index > activeIndex && starts(index));
      const any = options.findIndex((_item, index) => starts(index));
      if (after >= 0) setActive(after);
      else if (any >= 0) setActive(any);
    }
  };
  trigger.addEventListener('keydown', onSelectKeydown);
  listbox.addEventListener('keydown', onSelectKeydown);

  // The search field belongs to no form: its typing must not mark a form dirty or auto-submit it.
  search.addEventListener('input', (event) => {
    event.stopPropagation();
    filter();
  });
  search.addEventListener('change', (event) => event.stopPropagation());
  search.addEventListener('keydown', navigate);

  listbox.addEventListener('click', (event) => {
    const item = event.target.closest('.pt-select-option');
    if (item) commit(options.indexOf(item));
  });

  clear.addEventListener('click', () => {
    Array.from(select.options).forEach((option) => { option.selected = false; });
    announceChange();
    syncLabel();
    focusHolder().focus({ preventScroll: true });
  });

  listbox.addEventListener('mousemove', (event) => {
    const item = event.target.closest('.pt-select-option');
    const index = options.indexOf(item);
    if (item && index !== activeIndex && choosable(index)) setActive(index);
  });

  wrap._ptSelectClose = close;
  syncLabel();
}

// One document listener for every enhanced select: lists are replaced on paging and filtering,
// and per-select document listeners would keep every detached list alive.
function closeSelectsOutside(event) {
  document.querySelectorAll('.pt-select-trigger[aria-expanded="true"]').forEach((trigger) => {
    const wrap = trigger.closest('.pt-select-wrap');
    if (!wrap.contains(event.target)) wrap._ptSelectClose?.();
  });
}

export function enhancePolytecSelects(root = document) {
  if (!document.documentElement.dataset.ptSelectCloseReady) {
    document.documentElement.dataset.ptSelectCloseReady = 'true';
    document.addEventListener('click', closeSelectsOutside);
  }
  if (root instanceof HTMLSelectElement) {
    if (root.classList.contains('pt-select') && !root.classList.contains('pt-select--enhanced')) enhanceSelect(root);
    return;
  }
  root.querySelectorAll?.('select.pt-select:not(.pt-select--enhanced)').forEach(enhanceSelect);
}

const enhanceSelects = enhancePolytecSelects;

// Amount inputs: `<input class="pt-input" type="text" inputmode="numeric" data-pt-amount>` hold a
// whole amount (e.g. euros) and show thousands separators while typing. Every character that is
// not a digit is dropped, so "1.500", "1,500" and "1 500" all read 1500. The separator is ","
// or the attribute's value. The field's value is the formatted text: a form posts "1,500" and
// scripts read the number with parsePolytecAmount(). Assigning a plain number ("1500",
// "1234.56") formats it, rounded to a whole amount.
const AMOUNT_SELECTOR = 'input[data-pt-amount]';
const PLAIN_NUMBER = /^\s*-?\d+(\.\d+)?\s*$/;

export function parsePolytecAmount(text) {
  const digits = String(text ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

export function formatPolytecAmount(value, separator = ',') {
  const amount = typeof value === 'number' ? value : parsePolytecAmount(value);
  if (amount === null || Number.isNaN(amount)) return '';
  return String(Math.round(Math.abs(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

function enhanceAmountInput(input) {
  if (input.dataset.ptAmountReady) return;
  input.dataset.ptAmountReady = 'true';
  const separator = input.dataset.ptAmount || ',';
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const show = (text) => formatPolytecAmount(PLAIN_NUMBER.test(text) ? Number(text) : text, separator);
  Object.defineProperty(input, 'value', {
    configurable: true,
    get() { return descriptor.get.call(this); },
    set(next) { descriptor.set.call(this, show(next === null || next === undefined ? '' : String(next))); },
  });
  input.addEventListener('input', () => {
    const typed = descriptor.get.call(input);
    const caret = input.selectionStart ?? typed.length;
    const digitsBeforeCaret = typed.slice(0, caret).replace(/\D/g, '').length;
    const formatted = formatPolytecAmount(typed.replace(/\D/g, '').replace(/^0+(?=\d)/, ''), separator);
    if (formatted === typed) return;
    descriptor.set.call(input, formatted);
    // The caret stays behind the same digit it followed before the separators moved.
    let position = 0;
    for (let seen = 0; position < formatted.length && seen < digitsBeforeCaret; position += 1) {
      if (/\d/.test(formatted[position])) seen += 1;
    }
    input.setSelectionRange(position, position);
  });
  descriptor.set.call(input, show(descriptor.get.call(input)));
}

export function enhancePolytecAmounts(root = document) {
  if (root instanceof HTMLInputElement) {
    if (root.matches(AMOUNT_SELECTOR)) enhanceAmountInput(root);
    return;
  }
  root.querySelectorAll?.(AMOUNT_SELECTOR).forEach(enhanceAmountInput);
}

// Date fields: `<input class="pt-input" type="text" inputmode="numeric" data-pt-date>` show and accept
// dd.mm.yyyy whatever the browser's language (a native date input follows the browser's locale).
// Typing "1.10.26", "01102026" or "2026-10-01" reads 01.10.2026 once the field is left; the
// calendar button (or Alt+ArrowDown) opens the kit calendar with ISO week numbers. The value is the
// text; scripts read the ISO date with parsePolytecDate() and assigning an ISO date shows it as
// dd.mm.yyyy. Labels: data-pt-date-picker-label (default "Choose date").
const DATE_SELECTOR = 'input[data-pt-date]';

export function parsePolytecDate(text) {
  const value = String(text ?? '').trim();
  if (!value) return null;
  let day;
  let month;
  let year;
  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) [, year, month, day] = match;
  else if ((match = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/))) [, day, month, year] = match;
  else if ((match = value.match(/^(\d{2})(\d{2})(\d{4})$/))) [, day, month, year] = match;
  else return null;
  year = Number(year.length === 2 ? `20${year}` : year);
  month = Number(month);
  day = Number(day);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatPolytecDate(value) {
  const iso = parsePolytecDate(value);
  return iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : String(value ?? '');
}

// "today" in local time (not UTC, which is yesterday or tomorrow near midnight), else the ISO date as given.
function pickerLimit(value) {
  if (value !== 'today') return value || '';
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function enhanceDateInput(input) {
  if (input.dataset.ptDateReady) return;
  input.dataset.ptDateReady = 'true';
  input.placeholder ||= 'dd.mm.yyyy';
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(input, 'value', {
    configurable: true,
    get() { return descriptor.get.call(this); },
    set(next) { descriptor.set.call(this, formatPolytecDate(next === null || next === undefined ? '' : next)); },
  });
  descriptor.set.call(input, formatPolytecDate(descriptor.get.call(input)));
  input.addEventListener('blur', () => {
    const shown = formatPolytecDate(descriptor.get.call(input));
    if (shown !== descriptor.get.call(input)) descriptor.set.call(input, shown);
  });

  const label = input.dataset.ptDatePickerLabel || 'Choose date';
  attachCalendar(input, label, () => ({
    mode: 'date', value: parsePolytecDate(input.value) || '',
    // data-pt-date-min / data-pt-date-max ("today" or an ISO date) limit the days the calendar offers.
    min: pickerLimit(input.dataset.ptDateMin), max: pickerLimit(input.dataset.ptDateMax),
    onPick(iso) {
      input.value = iso;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
  }));
}

// One calendar is open at a time; it floats against the viewport inside the field's wrapper, so a
// modal dialog keeps it interactive and a scrolling container never clips it.
let openCalendar = null;

function attachCalendar(input, label, options) {
  const wrap = document.createElement('span');
  wrap.className = 'pt-date-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const picker = document.createElement('button');
  picker.type = 'button';
  picker.className = 'pt-date__picker';
  picker.setAttribute('aria-label', label);
  picker.setAttribute('aria-haspopup', 'dialog');
  picker.setAttribute('aria-expanded', 'false');
  picker.title = label;
  picker.innerHTML = '<svg class="pt-icon" aria-hidden="true" focusable="false"><use href="#pt-icon-calendar"></use></svg>';
  picker.disabled = input.disabled || input.readOnly;
  wrap.append(picker);
  new MutationObserver(() => { picker.disabled = input.disabled || input.readOnly; })
    .observe(input, { attributes: true, attributeFilter: ['disabled', 'readonly'] });
  const open = () => {
    if (openCalendar?.wrap === wrap) { openCalendar.close(true); return; }
    openCalendar?.close(false);
    const settings = options();
    const reposition = () => placeFloating(input, calendar);
    const outside = (event) => { if (!wrap.contains(event.target)) close(false); };
    const close = (restore) => {
      if (openCalendar?.calendar !== calendar) return;
      openCalendar = null;
      calendar.remove();
      picker.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      if (restore) input.focus();
    };
    const calendar = createPolytecCalendar({
      ...settings, label,
      onPick(iso) { settings.onPick(iso); close(true); },
      onClose: close,
    });
    openCalendar = { wrap, calendar, close };
    wrap.append(calendar);
    reposition();
    picker.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    calendar.focusCurrent();
  };
  picker.addEventListener('click', open);
  input.addEventListener('keydown', (event) => {
    if (event.altKey && event.key === 'ArrowDown' && !picker.disabled) {
      event.preventDefault();
      open();
    }
  });
}

// Week fields: `<input class="pt-input" type="text" data-pt-week name="week" value="2026-W46">` show
// data-pt-week-format (default "W{week} {year}", e.g. "KW {week} · {year}") and submit the ISO week.
// Typing "46", "46/2026", "2026-W46" or a date picks that week once the field is left; the calendar
// picks a whole week. Scripts read the ISO week from data-pt-week-value. Labels:
// data-pt-week-picker-label (default "Choose week").
const WEEK_SELECTOR = 'input[data-pt-week]';

function enhanceWeekInput(input) {
  if (input.dataset.ptWeekReady) return;
  input.dataset.ptWeekReady = 'true';
  const format = input.dataset.ptWeekFormat || 'W{week} {year}';
  let iso = parsePolytecWeek(input.value, 0, parsePolytecDate) || '';
  const show = () => {
    const match = iso.match(/^(\d{4})-W(\d{2})$/);
    input.value = match ? format.replace('{week}', String(Number(match[2]))).replace('{year}', match[1]) : '';
    input.dataset.ptWeekValue = iso;
  };
  const typed = () => parsePolytecWeek(input.value, Number(iso.slice(0, 4)) || new Date().getFullYear(), parsePolytecDate);
  show();
  input.addEventListener('change', (event) => {
    if (!event.isTrusted) return;
    const next = typed();
    if (!next || next === iso) {
      show();
      event.stopImmediatePropagation();
      return;
    }
    iso = next;
    show();
  });
  input.form?.addEventListener('formdata', (event) => {
    if (input.name && !input.disabled) event.formData.set(input.name, typed() || iso);
  });
  attachCalendar(input, input.dataset.ptWeekPickerLabel || 'Choose week', () => ({
    mode: 'week', value: iso ? isoWeekStart(Number(iso.slice(0, 4)), Number(iso.slice(6))) : '',
    onPick(monday) {
      const { year, week } = isoWeekOf(monday);
      const next = `${year}-W${String(week).padStart(2, '0')}`;
      if (next === iso) return;
      iso = next;
      show();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
  }));
}

export function enhancePolytecDates(root = document) {
  if (root instanceof HTMLInputElement) {
    if (root.matches(DATE_SELECTOR)) enhanceDateInput(root);
    if (root.matches(WEEK_SELECTOR)) enhanceWeekInput(root);
    return;
  }
  root.querySelectorAll?.(DATE_SELECTOR).forEach(enhanceDateInput);
  root.querySelectorAll?.(WEEK_SELECTOR).forEach(enhanceWeekInput);
}

// Markup inserted after load (rows rendered by the application) is enhanced automatically.
function observeInsertedControls(root) {
  const target = root === document ? document.body : root;
  if (!target || typeof MutationObserver === 'undefined') return;
  new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        initTableEditors(node);
        initScheduleBoards(node);
        initTimeBoards(node);
        initPlanningGrids(node);
        enhancePolytecSelects(node);
        enhancePolytecAmounts(node);
        enhancePolytecDates(node);
      });
    });
  }).observe(target, { childList: true, subtree: true });
}

// Help bubbles open below their "?" (above when the viewport has no room) and are kept inside
// the viewport, so a card at the edge of the work area or a scrolling table never cuts them off.
function placeHelp(help) {
  const bubble = help?.querySelector?.('.pt-help__bubble');
  const trigger = help?.querySelector?.('.pt-help__trigger');
  if (!bubble || !trigger) return;
  help.classList.add('is-placed');
  placeFloating(trigger, bubble, { align: 'end' });
}

function initHelpPlacement(root) {
  let current = null;
  const show = (event) => {
    const help = event.target.closest?.('.pt-help');
    if (!help) return;
    current = help;
    placeHelp(help);
  };
  root.addEventListener('pointerover', show);
  root.addEventListener('focusin', show);
  window.addEventListener('scroll', () => { if (current?.matches(':hover, :focus-within')) placeHelp(current); }, true);
}

// Tabs: `[data-pt-tabs]` holds `role="tab"` buttons whose `aria-controls` names the panel.
// Selection follows WAI-ARIA "automatic activation": click or arrow keys select and show.
export function selectPolytecTab(tab, { focus = false } = {}) {
  const tablist = tab?.closest?.('[data-pt-tabs]');
  if (!tablist) return;
  tablist.querySelectorAll('[role="tab"]').forEach((candidate) => {
    const selected = candidate === tab;
    candidate.setAttribute('aria-selected', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(candidate.getAttribute('aria-controls') || '');
    if (panel) panel.hidden = !selected;
  });
  if (focus) tab.focus();
  tablist.dispatchEvent(new CustomEvent('pt:tab-change', { bubbles: true, detail: { tab } }));
}

// scope_select(): only the [data-pt-scope] blocks of the chosen value show (e.g. one SAP plant of a record).
export function selectPolytecScope(value) {
  const select = document.querySelector('select[data-pt-scope-select]');
  if (!select) return;
  if (value !== undefined && value !== select.value && [...select.options].some(option => option.value === value)) {
    select.value = value;
    select.dispatchEvent(new Event('pt:select-sync'));
  }
  document.querySelectorAll('[data-pt-scope]').forEach((block) => { block.hidden = block.dataset.ptScope !== select.value; });
}

function initScopeSelect(root) {
  root.querySelectorAll?.('select[data-pt-scope-select]').forEach((select) => {
    if (select.dataset.ptScopeReady) return;
    select.dataset.ptScopeReady = 'true';
    select.addEventListener('change', () => selectPolytecScope());
    selectPolytecScope();
  });
}

// tabs(..., address=true): the address keeps the open tab, and a link to an element inside a hidden panel or
// scope opens that panel and scope first, then scrolls to the element.
function revealAddressTarget() {
  const id = decodeURIComponent(window.location.hash.slice(1));
  const target = id && document.getElementById(id);
  if (!target) return;
  const scope = target.closest('[data-pt-scope]');
  if (scope) selectPolytecScope(scope.dataset.ptScope);
  const panel = target.closest('[role="tabpanel"]');
  const tab = panel && document.querySelector(`[data-pt-tabs-address] [role="tab"][aria-controls="${CSS.escape(panel.id)}"]`);
  if (tab && tab.getAttribute('aria-selected') !== 'true') selectPolytecTab(tab);
  if (target !== panel) target.scrollIntoView({ block: 'start' });
}

function initTabAddress(root) {
  const lists = [...(root.querySelectorAll?.('[data-pt-tabs-address]') || [])].filter(list => !list.dataset.ptAddressReady);
  if (!lists.length) return;
  lists.forEach((list) => {
    list.dataset.ptAddressReady = 'true';
    list.addEventListener('pt:tab-change', (event) => {
      const panel = event.detail?.tab?.getAttribute('aria-controls');
      if (panel && window.location.hash !== `#${panel}`) window.history.replaceState(window.history.state, '', `#${panel}`);
    });
  });
  if (!window.ptTabAddressListening) {
    window.ptTabAddressListening = true;
    window.addEventListener('hashchange', revealAddressTarget);
  }
  revealAddressTarget();
}

// search_terms(): Enter in <input data-pt-search-terms="name"> turns the typed text into terms (hidden inputs
// `name`, which the server shows as chips) and searches again. "Quoted" parts become terms of their own.
export function polytecSearchTerms(text) {
  const quoted = [...String(text).matchAll(/"([^"]*)"/g)].map(match => match[1].trim()).filter(Boolean);
  const rest = String(text).replace(/"[^"]*"?/g, ' ').replace(/\s+/g, ' ').trim();
  return [...quoted, ...(rest ? [rest] : [])];
}

function initSearchTerms(root) {
  root.querySelectorAll?.('input[data-pt-search-terms]').forEach((input) => {
    if (input.dataset.ptSearchTermsReady) return;
    input.dataset.ptSearchTermsReady = 'true';
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing || !input.form) return;
      const terms = polytecSearchTerms(input.value);
      if (!terms.length) return;
      event.preventDefault();
      const name = input.dataset.ptSearchTerms;
      const known = new Set([...input.form.querySelectorAll('input[type="hidden"]')]
        .filter(hidden => hidden.name === name).map(hidden => hidden.value));
      terms.filter(term => !known.has(term)).forEach((term) => {
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = name;
        hidden.value = term;
        input.form.append(hidden);
      });
      input.value = '';
      input.form.requestSubmit();
    });
  });
}

function initTabs(root) {
  root.addEventListener('keydown', (event) => {
    const tab = event.target.closest?.('[data-pt-tabs] [role="tab"]');
    if (!tab) return;
    const tabs = Array.from(tab.closest('[data-pt-tabs]').querySelectorAll('[role="tab"]'));
    const index = tabs.indexOf(tab);
    let next = null;
    if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
    else if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
    else if (event.key === 'Home') next = tabs[0];
    else if (event.key === 'End') next = tabs[tabs.length - 1];
    if (!next) return;
    event.preventDefault();
    selectPolytecTab(next, { focus: true });
  });
}

// The sidebar starts collapsed (the template renders it that way, so there is no flash) and a
// viewer's choice is remembered for the browser session only - sessionStorage keeps it across
// refreshes and navigation without persisting anything about the viewer.
const SIDEBAR_STORAGE_KEY = 'polytec-ui:sidebar-collapsed';

function readSidebarPreference() {
  try {
    const stored = window.sessionStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored === null ? null : stored === 'true';
  } catch {
    return null;
  }
}

function writeSidebarPreference(collapsed) {
  try {
    window.sessionStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  } catch {
    // Private windows and blocked site data simply lose the preference on the next load.
  }
}

function applySidebarCollapsed(workspace, collapsed) {
  document.documentElement.dataset.opsSidebarCollapsed = String(collapsed);
  workspace.classList.toggle('is-collapsed', collapsed);
  const label = collapsed ? 'Expand navigation' : 'Collapse navigation';
  workspace.querySelectorAll('[data-ops-sidebar-toggle]').forEach((toggle) => {
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('title', label);
    const text = toggle.querySelector('span');
    if (text) text.textContent = label;
  });
}

function initOpsSidebar(root) {
  const stored = readSidebarPreference();
  if (stored === null) return;
  root.querySelectorAll?.('[data-ops-workspace]').forEach((workspace) => {
    applySidebarCollapsed(workspace, stored);
  });
}

// A filter panel opened on a phone stays open for the browser session, so the list that an
// autosubmitted filter reloads still shows its filters.
function filterPanelKey(panel) {
  return `polytec-ui:filters-open:${window.location.pathname}:${panel.id}`;
}

function setFilterPanelOpen(panel, open, remember = true) {
  panel.classList.toggle('is-open', open);
  panel.querySelector('.pt-filter-panel__toggle')?.setAttribute('aria-expanded', String(open));
  if (!remember) return;
  try {
    window.sessionStorage.setItem(filterPanelKey(panel), String(open));
  } catch {
    // Private windows and blocked site data simply start closed again.
  }
}

// action_menu(): a <details> that works without JavaScript. With it, one menu is open at a time and Escape
// (back to the ⋯ button), a click outside or choosing a link closes it. Submit buttons keep the menu open
// until the page leaves, so a confirm dialog can still ask first.
function initActionMenus() {
  if (document.documentElement.dataset.ptActionMenus) return;
  document.documentElement.dataset.ptActionMenus = 'true';
  const openMenus = () => document.querySelectorAll('details[data-pt-action-menu][open]');
  document.addEventListener('toggle', (event) => {
    const menu = event.target;
    if (!menu.matches?.('details[data-pt-action-menu]') || !menu.open) return;
    openMenus().forEach((other) => { if (other !== menu) other.open = false; });
  }, true);
  document.addEventListener('click', (event) => {
    openMenus().forEach((menu) => {
      if (!menu.contains(event.target) && !event.target.closest?.('dialog')) menu.open = false;
      else if (event.target.closest('.pt-action-menu__panel a[href]')) menu.open = false;
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    openMenus().forEach((menu) => {
      menu.open = false;
      menu.querySelector('summary').focus();
    });
  });
}

function initFilterPanels(root) {
  root.querySelectorAll?.('[data-pt-filter-panel]').forEach((panel) => {
    let stored = null;
    try {
      stored = window.sessionStorage.getItem(filterPanelKey(panel));
    } catch {
      stored = null;
    }
    if (stored === 'true') setFilterPanelOpen(panel, true, false);
  });
}

// A slow server must never look like an ignored tap: a link or form that leaves the page marks the
// document at once (a thin bar, see polytec-ui.css) until the next page replaces it. The check runs after
// every other handler, so links and forms whose default a confirmation dialog prevented stay quiet.
function leavesPage(event) {
  if (event.type === 'submit') {
    const form = event.target;
    return form instanceof HTMLFormElement && !form.target && !form.hasAttribute('download');
  }
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const link = event.target.closest?.('a[href]');
  if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return false;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  return !(url.pathname === window.location.pathname && url.search === window.location.search && url.hash);
}

function initNavigationFeedback() {
  if (document.documentElement.dataset.ptNavigationFeedback) return;
  document.documentElement.dataset.ptNavigationFeedback = 'true';
  let timer;
  const start = (event) => setTimeout(() => {
    if (event.defaultPrevented || !leavesPage(event)) return;
    document.documentElement.classList.add('pt-navigating');
    clearTimeout(timer);
    // A download or a 204 keeps the page; the bar must not run forever.
    timer = setTimeout(() => document.documentElement.classList.remove('pt-navigating'), 10000);
  });
  document.addEventListener('click', start);
  document.addEventListener('submit', start);
  window.addEventListener('pageshow', () => document.documentElement.classList.remove('pt-navigating'));
  // iOS Safari applies :active only when the page listens to touches.
  document.addEventListener('touchstart', () => {}, { passive: true });
}

// Refresh for installed web apps, which have no browser reload button: the header button
// ([data-ops-refresh]) and, on touch screens, pulling the work area down while it is at the top. The shell
// scrolls only its work area, so the browser's own pull-to-refresh never fires. Both reload the current
// address; a form with unsaved input asks first. A page that loads its data by script listens for the
// cancelable `ops:refresh` event on document, calls preventDefault() and reloads its data itself.
function initRefresh() {
  if (document.documentElement.dataset.ptRefreshReady) return;
  document.documentElement.dataset.ptRefreshReady = 'true';
  const refresh = () => {
    // A page that keeps its data in script (filters, charts) answers the event itself and cancels the reload.
    if (!document.dispatchEvent(new CustomEvent('ops:refresh', { cancelable: true }))) return true;
    if (document.querySelector('form[data-pt-dirty="true"]') && !window.confirm('Reload and discard unsaved changes?')) return false;
    document.documentElement.classList.add('pt-refreshing');
    window.location.reload();
    return true;
  };
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-ops-refresh]')) refresh();
  });
  const main = document.querySelector('.ops-workspace > .pt-standalone-main');
  if (!main || !('ontouchstart' in window)) return;
  const threshold = 72;
  const indicator = document.createElement('div');
  indicator.className = 'ops-pull';
  indicator.hidden = true;
  indicator.setAttribute('aria-hidden', 'true');
  indicator.innerHTML = '<svg class="pt-icon" aria-hidden="true" focusable="false"><use href="#pt-icon-refresh"></use></svg>';
  main.append(indicator);
  let startY = null;
  const reset = () => { startY = null; indicator.hidden = true; indicator.style.removeProperty('--pull'); indicator.classList.remove('is-ready'); };
  main.addEventListener('touchstart', (event) => {
    const blocked = event.target.closest?.('dialog, .pt-table-wrap, textarea, select, [data-pt-sortable], [data-pt-grid]');
    startY = main.scrollTop <= 0 && event.touches.length === 1 && !blocked ? event.touches[0].clientY : null;
  }, { passive: true });
  main.addEventListener('touchmove', (event) => {
    if (startY === null) return;
    const pull = event.touches[0].clientY - startY;
    if (pull <= 8 || main.scrollTop > 0) { if (pull < 0) reset(); return; }
    indicator.hidden = false;
    indicator.style.setProperty('--pull', String(Math.min(pull, threshold * 1.5)));
    indicator.classList.toggle('is-ready', pull >= threshold);
  }, { passive: true });
  main.addEventListener('touchend', () => {
    const ready = indicator.classList.contains('is-ready');
    reset();
    if (ready) refresh();
  }, { passive: true });
  main.addEventListener('touchcancel', reset, { passive: true });
}

// An element marked data-pt-visible-when="<field>=<value>[,<value>]" is only shown (and only submitted) while that
// field of its form has one of the values, e.g. the criticality of a work order only for repairs. The server renders
// the same state first (the `hidden` attribute) and still decides what it accepts.
function initVisibleWhen(root) {
  root.querySelectorAll('[data-pt-visible-when]').forEach((box) => {
    if (box.dataset.ptVisibleReady) return;
    box.dataset.ptVisibleReady = 'true';
    const [name, values = ''] = box.dataset.ptVisibleWhen.split('=');
    const form = box.closest('form');
    const field = form?.elements.namedItem(name);
    if (!field) return;
    const allowed = values.split(',');
    const update = () => {
      const shown = allowed.includes(field.value);
      box.hidden = !shown;
      box.querySelectorAll('input, select, textarea').forEach((control) => { control.disabled = !shown; });
      box.querySelectorAll('select').forEach(select => select.dispatchEvent(new Event('pt:select-sync')));
    };
    field.addEventListener('change', update);
    update();
  });
}

// A select marked data-pt-reload-on-change="<url>" inside a form that is posted (a new record) changes what the
// rest of the form offers (the plant decides which machines exist). A change opens <url> with everything typed so
// far as query parameters, so nothing has to be entered again; the page renders them back into the form.
function initReloadOnChange(root) {
  root.querySelectorAll('select[data-pt-reload-on-change]').forEach((select) => {
    if (select.dataset.ptReloadReady) return;
    select.dataset.ptReloadReady = 'true';
    select.addEventListener('change', () => {
      const form = select.form;
      if (!form) return;
      const url = new URL(select.dataset.ptReloadOnChange, window.location.href);
      url.search = new URLSearchParams([...new FormData(form)].filter(([name, value]) => typeof value === 'string'
        && value !== '' && !/^csrf/i.test(name))).toString();
      delete form.dataset.ptDirty;
      window.location.assign(url);
    });
  });
}

// Forms marked data-pt-autosubmit (e.g. a plant switcher) submit as soon as a value changes.
function initAutosubmit(root) {
  root.querySelectorAll('form[data-pt-autosubmit]').forEach((form) => {
    if (form.dataset.ptAutosubmitReady) return;
    form.dataset.ptAutosubmitReady = 'true';
    let timer;
    let pending;
    let shown = null;
    const focusKey = `pt-filter-focus:${form.id}`;
    const live = form.hasAttribute('data-pt-live-search') && form.method.toLowerCase() === 'get';
    const reload = (control) => {
      // Fallback: a normal navigation. A GET refresh must not steal the search cursor or keyboard select focus.
      if (live && form.id && control?.id) {
        try {
          sessionStorage.setItem(focusKey, JSON.stringify({ id: control.id, cursor: control.selectionStart }));
        } catch {
          // Without storage the refreshed page simply does not restore the cursor.
        }
      }
      form.requestSubmit();
    };
    // Live search replaces only the regions marked [data-pt-live-results][id] (results, pagination, the
    // heading actions that carry the current filters). Header, filters, keyboard, scroll position and
    // zoom stay as they are. Any failure falls back to a normal page load.
    const refresh = async (control) => {
      const url = new URL(form.action, window.location.href);
      url.search = new URLSearchParams([...new FormData(form)].filter(([, value]) => typeof value === 'string')).toString();
      const workspace = form.closest('.pt-table-workspace');
      if (workspace?.querySelector('[data-pt-live-results][id]')) {
        await refreshList(workspace, url, { history: form.hasAttribute('data-pt-view-picker') ? 'push' : 'replace',
          focus: form.hasAttribute('data-pt-view-picker') ? 'view' : null });
        return;
      }
      if (url.href === shown) return;
      pending?.abort();
      const request = pending = new AbortController();
      const regions = [...document.querySelectorAll('[data-pt-live-results][id]')];
      regions.forEach(region => region.setAttribute('aria-busy', 'true'));
      try {
        const response = await fetch(url, { signal: request.signal, credentials: 'same-origin', headers: { Accept: 'text/html' } });
        const fresh = new DOMParser().parseFromString(await response.text(), 'text/html');
        const sameList = response.ok && new URL(response.url).pathname === url.pathname
          && regions.every(region => fresh.getElementById(region.id));
        if (!sameList) throw new Error('not a list page');
        regions.forEach(region => region.replaceWith(document.importNode(fresh.getElementById(region.id), true)));
        document.querySelectorAll('[data-pt-filter-panel]').forEach((panel) => {
          const toggle = panel.querySelector('.pt-filter-panel__toggle');
          const next = fresh.getElementById(panel.id)?.querySelector('.pt-filter-panel__toggle');
          if (toggle && next) toggle.innerHTML = next.innerHTML;
        });
        window.history.replaceState(window.history.state, '', url);
        shown = url.href;
      } catch (error) {
        if (error.name === 'AbortError') return;
        regions.forEach(region => region.removeAttribute('aria-busy'));
        reload(control);
      }
    };
    const submit = (control) => {
      clearTimeout(timer);
      if (live && document.querySelector('[data-pt-live-results][id]')) refresh(control);
      else reload(control);
    };
    form.addEventListener('change', event => submit(event.target));
    if (form.hasAttribute('data-pt-live-search')) {
      // A select's own option search (.pt-select-search) only filters its options, never the list.
      form.querySelectorAll('input[type="search"]:not(.pt-select-search)').forEach(input => {
        input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => submit(input), 350); });
      });
      const saved = sessionStorage.getItem(focusKey);
      sessionStorage.removeItem(focusKey);
      if (saved) {
        const { id, cursor } = JSON.parse(saved);
        const control = form.querySelector(`#${CSS.escape(id)}`);
        (document.getElementById(`${id}-trigger`) || control)?.focus({ preventScroll: true });
        if (control instanceof HTMLInputElement && typeof cursor === 'number') control.setSelectionRange(cursor, cursor);
      }
    }
  });
}

// A dialog's close button sits outside the form it guards; the dialog's guarded form counts too.
function guardedFormFor(trigger) {
  return (trigger.dataset.ptGuardForm ? document.getElementById(trigger.dataset.ptGuardForm) : null)
    || trigger.closest('form[data-pt-guard-dirty]')
    || (trigger.hasAttribute('data-pt-dialog-close') ? trigger.closest('dialog')?.querySelector('form[data-pt-guard-dirty]') : null);
}

function enhanceAccessMatrices(root) {
  root.querySelectorAll('[data-pt-matrix]').forEach(matrix => {
    if (matrix.dataset.ptMatrixReady) return;
    matrix.dataset.ptMatrixReady = 'true';
    const appFilter = matrix.querySelector('[data-pt-matrix-filter-app]');
    const search = matrix.querySelector('[data-pt-matrix-search]');
    const assigned = matrix.querySelector('[data-pt-matrix-assigned]');
    const bulkApp = matrix.querySelector('[data-pt-matrix-bulk-app]');
    const bulkRole = matrix.querySelector('[data-pt-matrix-bulk-role]');
    const mobile = window.matchMedia('(max-width: 639px)');
    const filter = () => {
      const app = appFilter?.value || (mobile.matches ? appFilter?.options[1]?.value : '');
      matrix.querySelectorAll('[data-pt-matrix-app]').forEach(cell => { cell.hidden = !!app && cell.dataset.ptMatrixApp !== app; });
      const needle = (search?.value || '').toLocaleLowerCase().trim();
      matrix.querySelectorAll('[data-pt-matrix-row]').forEach(row => {
        const applicable = [...row.querySelectorAll('[data-pt-matrix-cell]')].filter(cell =>
          !app || cell.closest('[data-pt-matrix-app]').dataset.ptMatrixApp === app);
        const hasAssignment = applicable.some(cell => cell.value !== 'inherit' || cell.dataset.ptMatrixGranted === 'true');
        row.hidden = !applicable.length || !row.dataset.ptMatrixRow.toLocaleLowerCase().includes(needle) || (assigned?.checked && !hasAssignment);
      });
      const visible = [...matrix.querySelectorAll('[data-pt-matrix-row]')].filter(row => !row.hidden);
      const canBulk = visible.length > 1;
      matrix.querySelectorAll('[data-pt-matrix-select-row]').forEach(checkbox => { checkbox.hidden = !canBulk; });
      const bulk = matrix.querySelector('[data-pt-matrix-bulk]');
      if (bulk) bulk.hidden = !canBulk || !visible.some(row => row.querySelector('[data-pt-matrix-select-row]')?.checked);
    };
    [appFilter, search, assigned].forEach(control => control?.addEventListener('input', filter));
    mobile.addEventListener('change', filter);
    matrix.querySelectorAll('[data-pt-matrix-select-row]').forEach(control => control.addEventListener('change', filter));
    const setBulkRoles = () => {
      const source = [...matrix.querySelectorAll('[data-pt-matrix-app]')]
        .find(cell => cell.dataset.ptMatrixApp === bulkApp.value && cell.querySelector('[data-pt-matrix-cell]'))
        ?.querySelector('[data-pt-matrix-cell]');
      // Bulk defaults never copy an existing person's selected role implicitly.
      bulkRole.replaceChildren(...[...(source?.options || [])].map(option => {
        const copy = option.cloneNode(true);
        copy.selected = false;
        if (copy.value === 'inherit' && bulkRole.dataset.ptMatrixInheritLabel) copy.textContent = bulkRole.dataset.ptMatrixInheritLabel;
        return copy;
      }));
      bulkRole.value = 'inherit';
      bulkRole.dispatchEvent(new Event('pt:select-sync'));
    };
    bulkApp?.addEventListener('change', setBulkRoles);
    appFilter?.addEventListener('input', () => {
      if (appFilter.value && bulkApp && bulkApp.value !== appFilter.value) {
        bulkApp.value = appFilter.value;
        setBulkRoles();
        bulkApp.dispatchEvent(new Event('pt:select-sync'));
      }
    });
    matrix.querySelector('[data-pt-matrix-apply]')?.addEventListener('click', () => {
      let changed = 0;
      matrix.querySelectorAll('[data-pt-matrix-row]').forEach(row => {
        if (row.hidden || !row.querySelector('[data-pt-matrix-select-row]')?.checked) return;
        const cell = [...row.querySelectorAll('[data-pt-matrix-app]')].find(item => item.dataset.ptMatrixApp === bulkApp.value);
        const select = cell?.querySelector('[data-pt-matrix-cell]');
        if (!select || ![...select.options].some(option => option.value === bulkRole.value)) return;
        select.value = bulkRole.value;
        select.dispatchEvent(new Event('change', {bubbles: true}));
        changed += 1;
      });
      const status = matrix.querySelector('[data-pt-matrix-status]');
      if (status) status.textContent = `${changed} selected scopes updated. Save to apply.`;
      filter();
    });
    if (bulkApp && bulkRole) setBulkRoles();
    filter();
  });
}

// Reorderable rows: drag the handle or use the arrows. Rows may move between the `data-pt-sort-list` groups of one
// `data-pt-sortable` table; arrows cross group borders, a group head's arrows move the whole group. The new positions
// are written to the rows' hidden outputs, so the form stays the only way data leaves the page.
function enhanceSortables(root) {
  root.querySelectorAll('[data-pt-sortable]').forEach(container => {
    if (container.dataset.ptSortableReady) return;
    container.dataset.ptSortableReady = 'true';
    const lists = () => [...container.querySelectorAll('[data-pt-sort-list]')];
    const itemsOf = list => [...list.querySelectorAll('[data-pt-sort-item]')];
    const write = (element, selector, value) => {
      const output = element.querySelector(selector);
      if (output && output.value !== String(value)) output.value = value;
    };
    const renumber = () => {
      let position = 0;
      lists().forEach((list, index) => {
        write(list, '[data-pt-sort-list-output]', (index + 1) * 10);
        itemsOf(list).forEach(item => {
          position += 10;
          write(item, '[data-pt-sort-order-output]', position);
          write(item, '[data-pt-sort-group-output]', list.dataset.ptSortList);
        });
      });
      container.dispatchEvent(new Event('change', {bubbles: true}));
    };
    const moveItem = (item, direction) => {
      const list = item.closest('[data-pt-sort-list]');
      const sibling = direction < 0 ? item.previousElementSibling : item.nextElementSibling;
      if (sibling?.matches('[data-pt-sort-item]')) {
        if (direction < 0) sibling.before(item);
        else sibling.after(item);
        return true;
      }
      const all = lists();
      const target = all[all.indexOf(list) + direction];
      if (!target) return false;
      const first = itemsOf(target)[0];
      if (direction < 0 || !first) target.append(item);
      else first.before(item);
      return true;
    };
    const moveList = (list, direction) => {
      const sibling = direction < 0 ? list.previousElementSibling : list.nextElementSibling;
      if (!sibling?.matches('[data-pt-sort-list]')) return false;
      if (direction < 0) sibling.before(list);
      else sibling.after(list);
      return true;
    };
    container.addEventListener('click', event => {
      const button = event.target.closest('[data-pt-sort-move]');
      if (!button || !container.contains(button)) return;
      const direction = button.dataset.ptSortMove === 'up' ? -1 : 1;
      const item = button.closest('[data-pt-sort-item]');
      const moved = item ? moveItem(item, direction) : moveList(button.closest('[data-pt-sort-list]'), direction);
      if (moved) {
        renumber();
        button.focus();
      }
    });
    container.addEventListener('pointerdown', event => {
      const handle = event.target.closest('[data-pt-sort-handle]');
      const item = handle?.closest('[data-pt-sort-item]');
      if (!item || event.button > 0) return;
      event.preventDefault();
      item.classList.add('pt-sorting');
      const move = pointer => {
        const over = document.elementFromPoint(pointer.clientX, pointer.clientY);
        const row = over?.closest('[data-pt-sort-item]');
        if (row && row !== item && container.contains(row)) {
          const box = row.getBoundingClientRect();
          if (pointer.clientY < box.top + box.height / 2) row.before(item);
          else row.after(item);
          return;
        }
        const list = over?.closest('[data-pt-sort-list]');
        if (!list || !container.contains(list)) return;
        if (!itemsOf(list).length) list.append(item);
        else if (over.closest('[data-pt-sort-list-head]')) itemsOf(list)[0].before(item);
      };
      const stop = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', stop);
        document.removeEventListener('pointercancel', stop);
        item.classList.remove('pt-sorting');
        renumber();
        handle.focus();
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', stop);
      document.addEventListener('pointercancel', stop);
    });
  });
}

// Fill grid: a click sets one cell, a drag across cells sets the whole range to the same state (like filling in a
// spreadsheet), a row or column head sets its whole line. A cell holds one state, shown by its pressed toggle.
function enhanceStateGrids(root) {
  root.querySelectorAll('[data-pt-grid]').forEach(grid => {
    if (grid.dataset.ptGridReady) return;
    grid.dataset.ptGridReady = 'true';
    const fallback = grid.dataset.ptGridDefault || '';
    const toggles = grid.querySelector('template[data-pt-grid-toggles]');
    grid.querySelectorAll('[data-pt-grid-cell]').forEach(cell => {
      if (toggles && !cell.firstElementChild) cell.append(toggles.content.cloneNode(true));
    });
    const rows = () => [...grid.querySelectorAll('[data-pt-grid-row]')].filter(row => !row.hidden);
    const allCells = row => [...row.querySelectorAll('[data-pt-grid-cell]')];
    // Row and column actions, drag ranges and head states only reach the columns that are shown.
    const cellsOf = row => allCells(row).filter(cell => !cell.hidden);
    const stateOf = cell => cell.dataset.ptGridState || fallback;
    const press = (scope, test) => scope.querySelectorAll('[data-pt-grid-set]').forEach(button => {
      button.setAttribute('aria-pressed', String(test(button.dataset.ptGridSet)));
    });
    const syncHeads = () => {
      const lines = rows().map(cellsOf);
      grid.querySelectorAll('[data-pt-grid-row-head]').forEach(head => {
        const cells = cellsOf(head.closest('[data-pt-grid-row]'));
        press(head, set => cells.length > 0 && cells.every(cell => stateOf(cell) === set));
      });
      grid.querySelectorAll('[data-pt-grid-col-head]').forEach(head => {
        const cells = lines.map(line => line.find(cell => cell.dataset.ptGridCol === head.dataset.ptGridColHead)).filter(Boolean);
        press(head, set => cells.length > 0 && cells.every(cell => stateOf(cell) === set));
      });
    };
    const apply = (cells, state) => {
      const touched = new Set();
      cells.forEach(cell => {
        if (stateOf(cell) === state) return;
        cell.dataset.ptGridState = state;
        press(cell, set => set === state);
        touched.add(cell.closest('[data-pt-grid-row]'));
      });
      touched.forEach(row => {
        const output = row.querySelector('[data-pt-grid-output]');
        if (!output) return;
        output.value = allCells(row).filter(cell => stateOf(cell) !== fallback)
          .map(cell => `${cell.dataset.ptGridCol}=${stateOf(cell)}`).join(' ');
        output.dispatchEvent(new Event('change', {bubbles: true}));
      });
      syncHeads();
    };
    const lineOf = button => {
      const row = button.closest('[data-pt-grid-row-head]')?.closest('[data-pt-grid-row]');
      if (row) return cellsOf(row);
      const column = button.closest('[data-pt-grid-col-head]')?.dataset.ptGridColHead;
      return rows().flatMap(cellsOf).filter(cell => cell.dataset.ptGridCol === column);
    };
    const rectangle = (from, to) => {
      const all = rows();
      const [r1, r2] = [from, to].map(cell => all.indexOf(cell.closest('[data-pt-grid-row]'))).sort((a, b) => a - b);
      const [c1, c2] = [from, to].map(cell => cellsOf(cell.closest('[data-pt-grid-row]')).indexOf(cell)).sort((a, b) => a - b);
      return all.slice(r1, r2 + 1).flatMap(row => cellsOf(row).slice(c1, c2 + 1));
    };
    const toggled = (cell, set) => (stateOf(cell) === set ? fallback : set);

    grid.querySelectorAll('[data-pt-grid-cell]').forEach(cell => press(cell, set => set === stateOf(cell)));

    // A multi-select (`select[data-pt-grid-columns="<grid id>"]`) chooses the columns that are shown; nothing chosen
    // shows all. The choice is remembered per browser.
    const picker = grid.id ? document.querySelector(`select[data-pt-grid-columns="${CSS.escape(grid.id)}"]`) : null;
    if (picker) {
      const storeKey = `pt-grid-columns:${grid.id}`;
      const showColumns = () => {
        const chosen = new Set([...picker.selectedOptions].map(option => option.value));
        const shown = column => chosen.size === 0 || chosen.has(column);
        grid.querySelectorAll('[data-pt-grid-col-head]').forEach(head => { head.hidden = !shown(head.dataset.ptGridColHead); });
        grid.querySelectorAll('[data-pt-grid-cell]').forEach(cell => { cell.hidden = !shown(cell.dataset.ptGridCol); });
        syncHeads();
      };
      try {
        const saved = JSON.parse(localStorage.getItem(storeKey) || '[]');
        [...picker.options].forEach(option => { option.selected = saved.includes(option.value); });
        picker.dispatchEvent(new Event('pt:select-sync'));
      } catch { /* storage is optional */ }
      picker.addEventListener('change', () => {
        try { localStorage.setItem(storeKey, JSON.stringify([...picker.selectedOptions].map(option => option.value))); } catch { /* optional */ }
        showColumns();
      });
      showColumns();
    }
    syncHeads();

    grid.addEventListener('click', event => {
      const button = event.target.closest('[data-pt-grid-set]');
      if (!button) return;
      const cell = button.closest('[data-pt-grid-cell]');
      if (cell) {
        // Pointer input is handled on release; a click without a pointer is the keyboard.
        if (event.detail === 0) apply([cell], toggled(cell, button.dataset.ptGridSet));
        return;
      }
      const cells = lineOf(button);
      const set = button.dataset.ptGridSet;
      apply(cells, cells.every(item => stateOf(item) === set) ? fallback : set);
    });

    grid.addEventListener('pointerdown', event => {
      const button = event.target.closest('[data-pt-grid-cell] [data-pt-grid-set]');
      if (!button || event.button > 0) return;
      event.preventDefault();
      const anchor = button.closest('[data-pt-grid-cell]');
      const state = toggled(anchor, button.dataset.ptGridSet);
      let selection = [anchor];
      const mark = cells => {
        selection.forEach(cell => cell.classList.remove('pt-grid__cell--selected'));
        selection = cells;
        if (cells.length > 1) cells.forEach(cell => cell.classList.add('pt-grid__cell--selected'));
      };
      const move = pointer => {
        const over = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest('[data-pt-grid-cell]');
        if (over && grid.contains(over)) mark(rectangle(anchor, over));
      };
      const stop = release => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', stop);
        document.removeEventListener('pointercancel', stop);
        const cells = selection;
        mark([]);
        if (release.type === 'pointerup') apply(cells, state);
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', stop);
      document.addEventListener('pointercancel', stop);
    });
  });
}

// Outcome banner of result_banner(): tone info/success/warning/danger. Success and info hide after
// `timeout` ms (default 6000, 0 keeps it); warnings and errors stay until the next result.
export function showPolytecResult(target, message, { tone = 'success', title = '', timeout } = {}) {
  const banner = typeof target === 'string' ? document.getElementById(target) : target;
  if (!banner) return;
  window.clearTimeout(banner._ptResultTimer);
  const icon = { success: 'check', info: 'info', warning: 'warning', danger: 'warning' }[tone] || 'info';
  banner.className = `pt-result pt-result--${tone}`;
  banner.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
  banner.setAttribute('aria-live', tone === 'danger' ? 'assertive' : 'polite');
  const text = document.createElement('span');
  if (title) { const strong = document.createElement('strong'); strong.textContent = title; text.append(strong); }
  const line = document.createElement('span'); line.textContent = message; text.append(line);
  banner.replaceChildren();
  banner.insertAdjacentHTML('afterbegin', `<svg class="pt-icon" aria-hidden="true" focusable="false"><use href="#pt-icon-${icon}"></use></svg>`);
  banner.append(text);
  banner.hidden = false;
  const wait = timeout ?? (tone === 'success' || tone === 'info' ? 6000 : 0);
  if (wait > 0) banner._ptResultTimer = window.setTimeout(() => { banner.hidden = true; }, wait);
}

// flash_messages() toasts: each hides after 5 s (a further 0.5 s per toast below it) or on click.
function initToasts(root) {
  root.querySelectorAll('[data-pt-toast]:not([data-pt-toast-ready])').forEach((toast, index) => {
    toast.dataset.ptToastReady = '';
    const hide = () => {
      if (toast.classList.contains('is-leaving')) return;
      toast.classList.add('is-leaving');
      window.setTimeout(() => {
        const region = toast.parentElement;
        toast.remove();
        if (region && !region.children.length) region.remove();
      }, 200);
    };
    toast.addEventListener('click', hide);
    window.setTimeout(hide, 5000 + index * 500);
  });
}

// relative_time(): "2 min ago" in the page language, refreshed every 15 s; data-pt-stale-after
// (seconds) adds .is-stale and fires a bubbling pt:stale event once.
export function updatePolytecRelativeTimes(root = document) {
  const format = new Intl.RelativeTimeFormat(document.documentElement.lang || 'en', { numeric: 'auto', style: 'short' });
  const now = Date.now();
  root.querySelectorAll('time[data-pt-relative-time]').forEach((element) => {
    const at = Date.parse(element.getAttribute('datetime'));
    if (Number.isNaN(at)) return;
    const seconds = Math.round((at - now) / 1000);
    const abs = Math.abs(seconds);
    const [value, unit] = abs < 60 ? [seconds, 'second'] : abs < 3600 ? [Math.round(seconds / 60), 'minute']
      : abs < 86400 ? [Math.round(seconds / 3600), 'hour'] : [Math.round(seconds / 86400), 'day'];
    const label = element.querySelector('span') || element;
    label.textContent = format.format(value, unit);
    const limit = Number(element.dataset.ptStaleAfter || 0);
    const stale = limit > 0 && -seconds > limit;
    if (stale && !element.classList.contains('is-stale')) element.dispatchEvent(new CustomEvent('pt:stale', { bubbles: true }));
    element.classList.toggle('is-stale', stale);
  });
}

// stepper(): - and + change the number within min/max; typing is clamped on change. Buttons at a
// limit are disabled. Works for steppers added later (event delegation).
function syncStepper(stepper) {
  const input = stepper.querySelector('.pt-stepper__input');
  if (!input) return;
  const min = Number(input.min || 0);
  const max = Number(input.max || Number.MAX_SAFE_INTEGER);
  const value = Math.round(Number(input.value));
  input.value = String(Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min);
  stepper.querySelector('[data-pt-stepper-step="-1"]').disabled = Number(input.value) <= min;
  stepper.querySelector('[data-pt-stepper-step="1"]').disabled = Number(input.value) >= max;
}

function initSteppers(root) {
  root.querySelectorAll('[data-pt-stepper]').forEach(syncStepper);
  if (document.documentElement.dataset.ptStepperReady) return;
  document.documentElement.dataset.ptStepperReady = 'true';
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-pt-stepper-step]');
    const stepper = button?.closest('[data-pt-stepper]');
    if (!stepper) return;
    const input = stepper.querySelector('.pt-stepper__input');
    input.value = String(Number(input.value) + Number(button.dataset.ptStepperStep));
    syncStepper(stepper);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  document.addEventListener('change', (event) => {
    const stepper = event.target.closest?.('[data-pt-stepper]');
    if (stepper && event.target.matches('.pt-stepper__input')) syncStepper(stepper);
  });
}

// keypad(): on-screen digits for touch screens. Keys append to the field up to maxlength, Clear
// empties it, Delete removes the last digit; a hardware keyboard still types into the field.
// inputmode="none" keeps the device keyboard closed. Works for keypads added later (delegation).
function initKeypads() {
  if (document.documentElement.dataset.ptKeypadReady) return;
  document.documentElement.dataset.ptKeypadReady = 'true';
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-pt-keypad-key], [data-pt-keypad-clear], [data-pt-keypad-delete]');
    const keypad = button?.closest('[data-pt-keypad]');
    if (!keypad) return;
    const input = keypad.querySelector('.pt-keypad__display');
    const max = input.maxLength > 0 ? input.maxLength : Infinity;
    if (button.hasAttribute('data-pt-keypad-clear')) input.value = '';
    else if (button.hasAttribute('data-pt-keypad-delete')) input.value = input.value.slice(0, -1);
    else if (input.value.length < max) input.value += button.dataset.ptKeypadKey;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

// clock(): the time of day as HH:MM:SS (24 h) in local time, the same format for event times.
export function formatPolytecClockTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, '0')).join(':');
}

function updateClocks() {
  const now = new Date();
  document.querySelectorAll('time[data-pt-clock]').forEach((element) => {
    element.textContent = formatPolytecClockTime(now);
    element.setAttribute('datetime', now.toISOString());
  });
}

function initClocks() {
  if (document.documentElement.dataset.ptClockReady) return;
  document.documentElement.dataset.ptClockReady = 'true';
  updateClocks();
  // Tick on the full second so the clock never lags a visible second behind.
  window.setTimeout(() => { updateClocks(); window.setInterval(updateClocks, 1000); }, 1000 - (Date.now() % 1000));
}

function initRelativeTimes() {
  if (document.documentElement.dataset.ptRelativeTimeReady) return;
  document.documentElement.dataset.ptRelativeTimeReady = 'true';
  updatePolytecRelativeTimes();
  window.setInterval(() => updatePolytecRelativeTimes(), 15000);
}

export function initPolytecUI(root = document) {
  initScheduleBoards(root);
  initTimeBoards(root);
  initPlanningGrids(root);
  initListWorkspaces(root);
  initListViews(root);
  initTableEditors(root);
  enhanceAccessMatrices(root);
  enhanceSortables(root);
  enhanceStateGrids(root);
  initializeConfirmationDialog(root);
  initHashNavigation(root);
  enhanceSelects(root);
  enhancePolytecAmounts(root);
  enhancePolytecDates(root);
  observeInsertedControls(root);
  initHelpPlacement(root);
  initTabs(root);
  initScopeSelect(root);
  initTabAddress(root);
  initSearchTerms(root);
  initOpsSidebar(root);
  initFilterPanels(root);
  initActionMenus();
  initAutosubmit(root);
  initReloadOnChange(root);
  initVisibleWhen(root);
  initNavigationFeedback();
  initRefresh();
  initRelativeTimes();
  initClocks();
  initSteppers(root);
  initKeypads();
  initToasts(root);

  root.querySelectorAll('form[data-pt-guard-dirty]').forEach((form) => {
    const markDirty = event => {
      if (event.target.closest('[data-pt-ignore-dirty]')) return;
      form.dataset.ptDirty = 'true';
    };
    form.addEventListener('input', markDirty);
    form.addEventListener('change', markDirty);
    form.addEventListener('reset', () => delete form.dataset.ptDirty);
    form.closest('dialog')?.addEventListener('close', () => delete form.dataset.ptDirty);
  });

  root.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.matches('[data-pt-table-editor]')) { event.preventDefault(); return; }
    if (form.matches('[data-pt-submit-once]') && form.getAttribute('aria-busy') === 'true') {
      event.preventDefault();
      return;
    }
    delete form.dataset.ptDirty;
    if (form.matches('[data-pt-submit-once]') && form.getAttribute('aria-busy') !== 'true') {
      setPolytecBusy(form, true);
    }
  });

  root.addEventListener('click', (event) => {
    const leaving = event.target.closest?.('a[href]');
    const tableDraft = document.querySelector('form:is([data-pt-table-editor], [data-pt-table-legacy])[data-pt-dirty="true"]');
    if (leaving && tableDraft && !leaving.getAttribute('href').startsWith('#')) {
      if (tableDraft.getAttribute('aria-busy') === 'true') { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (leaving.dataset.ptConfirmedOnce !== 'true') {
        event.preventDefault(); event.stopImmediatePropagation();
        requestConfirmation(leaving, 'Discard changes?', 'Leave this table and discard unsaved changes?');
        return;
      }
      delete tableDraft.dataset.ptDirty;
    }
    const busySubmit = event.target.closest?.(BUSY_SELECTOR);
    if (busySubmit?.form?.getAttribute('aria-busy') === 'true' || event.target.closest?.('button[aria-busy="true"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const trigger = event.target.closest?.('[data-pt-confirm], [data-pt-action="cancel"], [data-pt-dialog-close]');
    if (trigger && trigger.dataset.ptConfirmedOnce !== 'true') {
      const guardedForm = guardedFormFor(trigger);
      const isCancel = trigger.dataset.ptAction === 'cancel' || trigger.hasAttribute('data-pt-dialog-close');
      const isDirtyCancel = isCancel && guardedForm?.dataset.ptDirty === 'true';
      const explicitConfirm = trigger.hasAttribute('data-pt-confirm');
      if (explicitConfirm || isDirtyCancel) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const title = trigger.dataset.ptConfirmTitle || (isDirtyCancel ? 'Discard changes?' : 'Confirm action');
        const message = trigger.dataset.ptConfirm || guardedForm?.dataset.ptCancelMessage || 'Do you want to continue?';
        requestConfirmation(trigger, title, message);
        return;
      }
    }

    const tab = event.target.closest?.('[data-pt-tabs] [role="tab"]');
    if (tab) selectPolytecTab(tab);

    const filterToggle = event.target.closest?.('.pt-filter-panel__toggle');
    if (filterToggle) {
      const panel = filterToggle.closest('[data-pt-filter-panel]');
      if (panel) setFilterPanelOpen(panel, !panel.classList.contains('is-open'));
    }

    const disclosure = event.target.closest?.('[data-pt-disclosure]');
    if (disclosure) {
      const panel = document.getElementById(disclosure.dataset.ptDisclosure);
      if (panel) {
        const expanded = disclosure.getAttribute('aria-expanded') === 'true';
        disclosure.setAttribute('aria-expanded', String(!expanded));
        panel.hidden = expanded;
      }
    }

    const opener = event.target.closest?.('[data-pt-dialog-open]');
    if (opener) document.getElementById(opener.dataset.ptDialogOpen)?.showModal();

    const closer = event.target.closest?.('[data-pt-dialog-close]');
    if (closer) closer.closest('dialog')?.close('cancel');

    const sidebarToggle = event.target.closest?.('[data-ops-sidebar-toggle]');
    if (sidebarToggle) {
      const workspace = sidebarToggle.closest('[data-ops-workspace]');
      if (!workspace) return;
      applySidebarCollapsed(workspace, !workspace.classList.contains('is-collapsed'));
      writeSidebarPreference(workspace.classList.contains('is-collapsed'));
    }
  }, true);

  // Escape on a dialog with unsaved changes asks first, like its Cancel and close buttons.
  root.addEventListener('cancel', (event) => {
    const dialog = event.target;
    if (!(dialog instanceof HTMLDialogElement) || dialog.matches('[data-pt-confirm-dialog]')) return;
    const form = dialog.querySelector('form[data-pt-guard-dirty]');
    const closer = dialog.querySelector('[data-pt-action="cancel"], [data-pt-dialog-close]');
    if (form?.dataset.ptDirty !== 'true' || !closer) return;
    event.preventDefault();
    closer.click();
  }, true);

  // Escape hides an open help bubble without moving focus (WCAG 1.4.13); it shows again once the
  // pointer or focus leaves and comes back.
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const help = document.activeElement?.closest?.('.pt-help') || root.querySelector?.('.pt-help:hover');
    if (help) help.classList.add('is-dismissed');
  });
  root.addEventListener('pointerleave', (event) => {
    if (event.target.classList?.contains('pt-help')) event.target.classList.remove('is-dismissed');
  }, true);
  root.addEventListener('focusout', (event) => event.target.closest?.('.pt-help')?.classList.remove('is-dismissed'));

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const menu = root.querySelector?.('.ops-mobile-navigation__more[open]');
    if (!menu) return;
    menu.open = false;
    menu.querySelector('summary')?.focus();
  });
}

// Classic (non-module) application scripts reach the same API through window.PolytecUI.
window.PolytecUI = {
  initPolytecUI, setPolytecBusy, setPolytecButtonBusy, resetPolytecBusy, enhancePolytecSelects, enhancePolytecAmounts, enhancePolytecDates,
  selectPolytecTab, parsePolytecAmount, formatPolytecAmount, parsePolytecDate, formatPolytecDate,
  showPolytecResult, updatePolytecRelativeTimes, initSteppers, formatPolytecClockTime,
  refreshList,
  enhanceListControls(root) {
    initTableEditors(root);
    initListViews(root);
    enhanceSortables(root);
    enhanceSelects(root);
    enhancePolytecAmounts(root);
    enhancePolytecDates(root);
    initFilterPanels(root);
    initAutosubmit(root);
    initListWorkspaces(root);
    const legacy = Boolean(root.querySelector('[data-pt-table-legacy]'));
    root.querySelectorAll('form[data-pt-live-search] :is(input, select, button)').forEach(control => {
      if (legacy) { control._ptLegacyDisabled ??= control.disabled; control.disabled = true; }
      else if (control._ptLegacyDisabled !== undefined) { control.disabled = control._ptLegacyDisabled; delete control._ptLegacyDisabled; }
      if (control.tagName === 'SELECT') control.dispatchEvent(new Event('pt:select-sync'));
    });
  },
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initPolytecUI());
} else {
  initPolytecUI();
}
