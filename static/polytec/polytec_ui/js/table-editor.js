// Shared editing interaction only. Apps supply allowed cells, CSRF, revision tokens, URLs and
// canonical server-rendered rows. Saves are independent per row; failed drafts remain editable.
// Edit controls exist only in edit mode: the server renders the list in the other mode (mode URL),
// so read-mode pages stay small and paging never builds hidden controls.
import { fetchListPage } from './list-workspace.js';

// A switch cell sends its value when on and an empty value when off, so the server always gets the field.
function fieldValue(control) {
  if (control.multiple) return [...control.selectedOptions].map(o => o.value);
  if (control.type === 'checkbox') return control.checked ? control.value : '';
  return control.value;
}

function values(row) {
  return JSON.stringify([...row.querySelectorAll('[data-pt-row-field]')].map(control => [control.dataset.ptRowField, fieldValue(control)]));
}

function rows(form) { return [...form.querySelectorAll('[data-pt-row-url]')]; }
function dirtyRows(form) { return rows(form).filter(row => values(row) !== row._ptTableInitial); }
function toolbar(form) { return form._ptTableToolbar || form; }

function setEditing(form, editing) {
  const frozen = Boolean(form._ptTableFrozen);
  form._ptTableFrozen = editing;
  form.dataset.ptTableEditing = String(editing);
  const actions = toolbar(form);
  actions.querySelector('[data-pt-table-toggle]').setAttribute('aria-pressed', String(editing));
  actions.querySelector('[data-pt-table-toggle]').hidden = editing;
  actions.querySelector('[data-pt-table-save]').hidden = !editing;
  actions.querySelector('[data-pt-table-cancel]').hidden = !editing;
  form.closest('.pt-table-workspace')?.querySelectorAll('[data-pt-table-create]').forEach(element => { element.hidden = editing; });
  form.querySelectorAll('[data-pt-edit-only]').forEach(element => { element.hidden = !editing; });
  form.querySelectorAll('[data-pt-row-url]').forEach(row => {
    row.querySelectorAll('[data-pt-cell-edit]').forEach(cell => { cell.hidden = !editing; });
    row.querySelectorAll('[data-pt-cell-read]').forEach(cell => {
      cell.hidden = editing && Boolean(cell.parentElement.querySelector('[data-pt-cell-edit]'));
    });
    row.querySelectorAll('[data-pt-row-field]').forEach(control => {
      control.disabled = !editing;
      if (control.tagName === 'SELECT') control.dispatchEvent(new Event('pt:select-sync'));
    });
  });
  // Freeze list filters while editing so a live replacement cannot discard drafts. Navigation
  // and pagination still work after an explicit discard confirmation.
  form.closest('.pt-table-workspace')?.querySelectorAll('form:not([data-pt-table-editor]) input, form:not([data-pt-table-editor]) select, form:not([data-pt-table-editor]) button, [data-pt-manage-view]').forEach(control => {
    if (editing && !frozen) { control._ptTableWasDisabled = control.disabled; control.disabled = true; }
    else if (!editing && control._ptTableWasDisabled !== undefined) { control.disabled = control._ptTableWasDisabled; delete control._ptTableWasDisabled; }
    if (control.tagName === 'SELECT') control.dispatchEvent(new Event('pt:select-sync'));
  });
}

export function initTableEditors(root = document) {
  const forms = [...root.querySelectorAll('form[data-pt-table-editor]')];
  if (root.matches?.('form[data-pt-table-editor]')) forms.push(root);
  forms.forEach(form => {
    if (form.dataset.ptTableReady) return;
    form.dataset.ptTableReady = 'true';
    const workspace = form.closest('.pt-table-workspace');
    const slot = workspace?.querySelector('[data-pt-table-actions]');
    const actions = form.querySelector('.pt-table-editor__toolbar');
    if (slot && actions) { slot.replaceChildren(actions); form._ptTableToolbar = actions; }
    rows(form).forEach(row => { row._ptTableInitial = values(row); });
    const toggle = toolbar(form).querySelector('[data-pt-table-toggle]');
    const save = toolbar(form).querySelector('[data-pt-table-save]');
    const cancel = toolbar(form).querySelector('[data-pt-table-cancel]');
    const status = toolbar(form).querySelector('[data-pt-table-status]');
    toggle.hidden = false;
    toggle.disabled = !rows(form).length;
    if (toggle.disabled) status.textContent = 'No editable rows on this page.';
    if (form.dataset.ptTableEditing === 'true') setEditing(form, true);
    const syncDirty = () => {
      if (dirtyRows(form).length) form.dataset.ptDirty = 'true';
      else delete form.dataset.ptDirty;
    };
    // Swaps this editor for the same list rendered in the other mode; on failure the page reloads.
    const switchMode = async (message = '') => {
      const url = new URL(form.dataset.ptTableModeUrl, location.href);
      if (url.origin !== location.origin) return;
      form.setAttribute('aria-busy', 'true');
      toggle.disabled = cancel.disabled = save.disabled = true;
      try {
        const { response, page } = await fetchListPage(url, { signal: AbortSignal.timeout(15000) });
        const next = page.getElementById(form.id);
        if (!response.ok || !next) throw new Error('not a list response');
        if (form.dataset.ptTableEditing === 'true') setEditing(form, false);
        const replacement = document.importNode(next, true);
        form.replaceWith(replacement);
        initTableEditors(replacement.parentElement);
        window.PolytecUI?.enhanceListControls?.(replacement);
        const fresh = toolbar(replacement);
        if (message) fresh.querySelector('[data-pt-table-status]').textContent = message;
        fresh.querySelector(replacement.dataset.ptTableEditing === 'true' ? '[data-pt-table-cancel]' : '[data-pt-table-toggle]')?.focus({ preventScroll: true });
      } catch {
        location.reload();
      }
    };
    form._ptTableDiscard = () => {
      delete form.dataset.ptDirty;
      setEditing(form, false);
    };
    form.addEventListener('input', () => queueMicrotask(syncDirty));
    form.addEventListener('change', () => queueMicrotask(syncDirty));
    form.addEventListener('submit', event => { event.preventDefault(); save.click(); });
    toggle.addEventListener('click', () => {
      if (form.dataset.ptTableEditing === 'true') { cancel.click(); return; }
      status.textContent = '';
      switchMode();
    });
    cancel.addEventListener('click', () => switchMode());
    save.addEventListener('click', async () => {
      if (form.getAttribute('aria-busy') === 'true') return;
      const changed = dirtyRows(form);
      if (!changed.length) { switchMode('No changes to save.'); return; }
      const invalid = changed.flatMap(row => [...row.querySelectorAll('[data-pt-row-field]')]).find(control => !control.checkValidity());
      if (invalid) { invalid.setAttribute('aria-invalid', 'true'); invalid.reportValidity(); status.textContent = 'Please correct the marked fields.'; return; }
      form.setAttribute('aria-busy', 'true');
      window.PolytecUI.setPolytecButtonBusy(save);
      toggle.disabled = cancel.disabled = true;
      form.querySelectorAll('[data-pt-row-field]').forEach(control => { control.disabled = true; if (control.tagName === 'SELECT') control.dispatchEvent(new Event('pt:select-sync')); });
      let saved = 0, failed = 0, unavailable = false;
      for (const row of changed) {
        const error = row.querySelector('[data-pt-row-error]');
        if (unavailable) {
          failed += 1;
          if (error) error.textContent = 'Not attempted after an unavailable save. Your entries are retained.';
          continue;
        }
        row.querySelectorAll('[aria-invalid]').forEach(control => control.removeAttribute('aria-invalid'));
        if (error) error.textContent = '';
        try {
          const controls = [...row.querySelectorAll('[data-pt-row-field]')];
          const payload = new FormData();
          payload.set('csrf_token', form.elements.namedItem('csrf_token').value);
          payload.set('etag', row.dataset.ptRowEtag);
          controls.forEach(control => {
            if (control.multiple) [...control.selectedOptions].forEach(option => payload.append(control.dataset.ptRowField, option.value));
            else payload.append(control.dataset.ptRowField, fieldValue(control));
          });
          const url = new URL(row.dataset.ptRowUrl, location.href);
          if (url.origin !== location.origin) throw new Error('The save address is unavailable.');
          const response = await fetch(url, {method:'POST', body:payload, credentials:'same-origin', redirect:'error', signal:AbortSignal.timeout(15000), headers:{Accept:'application/json'}});
          unavailable = [401, 403, 429, 503].includes(response.status);
          const result = await response.json();
          if (!response.ok || typeof result.row_html !== 'string') {
            controls.forEach(control => { if (result.errors?.[control.dataset.ptRowField]) control.setAttribute('aria-invalid', 'true'); });
            throw new Error(result.message || Object.values(result.errors || {}).join(' ') || 'Saving failed. Your entries are retained.');
          }
          const body = document.createElement('tbody');
          body.innerHTML = result.row_html;
          const replacement = body.firstElementChild;
          if (!replacement?.matches('tr[data-pt-row-url]') || replacement.dataset.ptRowUrl !== row.dataset.ptRowUrl) throw new Error('Reload to verify the saved row.');
          replacement._ptTableInitial = values(replacement);
          row.replaceWith(replacement);
          saved += 1;
        } catch (problem) {
          failed += 1;
          unavailable ||= problem instanceof SyntaxError || problem instanceof TypeError || problem.name === 'TimeoutError';
          if (error) error.textContent = problem instanceof SyntaxError || problem instanceof TypeError || problem.name === 'TimeoutError'
            ? 'Saving failed. Your entries are retained.' : problem.message || 'Saving failed. Your entries are retained.';
        }
        status.textContent = `${saved} saved · ${failed} need attention · ${changed.length - saved - failed} remaining`;
      }
      form.removeAttribute('aria-busy');
      window.PolytecUI.setPolytecButtonBusy(save, false);
      toggle.disabled = cancel.disabled = false;
      syncDirty();
      if (!failed) { switchMode(`${saved} rows saved.`); return; }
      setEditing(form, true);
      status.textContent = `${saved} rows saved; ${failed} rows need attention. Your entries are retained.`;
      form.querySelector('[aria-invalid="true"], [data-pt-row-error]:not(:empty)')?.focus?.();
    });
  });
}

window.addEventListener('beforeunload', event => {
  if (!document.querySelector('form:is([data-pt-table-editor], [data-pt-table-legacy])[data-pt-dirty="true"]')) return;
  event.preventDefault();
  event.returnValue = '';
});
