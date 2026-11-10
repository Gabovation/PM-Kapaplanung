// Server-rendered lists keep one shell. No row data cache or client-side query engine is needed.
const requests = new WeakMap();

// The UI Kit base template answers this header with the page content only (no shell, no icon
// sprite), so list refreshes transfer and parse just the regions they replace.
export async function fetchListPage(url, { signal, method = 'GET', body = null } = {}) {
  const response = await fetch(url, { signal, credentials: 'same-origin', method, body,
    headers: { Accept: 'text/html', 'X-PT-Partial': 'content' } });
  return { response, page: new DOMParser().parseFromString(await response.text(), 'text/html') };
}

function editing(workspace) {
  return Boolean(workspace.querySelector('[data-pt-table-editing="true"], [data-pt-table-legacy]'));
}

export async function refreshList(workspace, address, { history = 'push', focus = null, body = null } = {}) {
  const url = new URL(address, location.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname) return false;
  if (editing(workspace)) return false;
  const previous = requests.get(workspace);
  previous?.abort();
  const controller = new AbortController();
  requests.set(workspace, controller);
  const regions = [...workspace.querySelectorAll('[data-pt-live-results][id]')];
  if (!regions.length) return false;
  const active = document.activeElement;
  const focused = active?.id ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
  regions.forEach(region => region.setAttribute('aria-busy', 'true'));
  try {
    const { response, page: fresh } = await fetchListPage(url, { signal: controller.signal, method: body ? 'POST' : 'GET', body });
    const target = new URL(response.url);
    if (!response.ok || target.origin !== url.origin || target.pathname !== url.pathname
      || !regions.every(region => fresh.getElementById(region.id))) throw new Error('not a list response');
    if (requests.get(workspace) !== controller) return false;
    // Close overlays before replacing their contents; otherwise focus remains in a detached dialog.
    workspace.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    regions.forEach(region => region.replaceWith(document.importNode(fresh.getElementById(region.id), true)));
    workspace.querySelector('[data-pt-table-actions]')?.replaceChildren();
    workspace.querySelectorAll('[data-pt-filter-panel]').forEach(panel => {
      const next = fresh.getElementById(panel.id)?.querySelector('.pt-filter-panel__toggle');
      const toggle = panel.querySelector('.pt-filter-panel__toggle');
      if (next && toggle) toggle.innerHTML = next.innerHTML;
    });
    // Back/Forward restores filters from the URL as well as rows. Filters normally remain in place
    // while typing; their controls must not be replaced and steal the user's cursor.
    workspace.querySelectorAll('form[data-pt-live-search][id]').forEach(form => {
        const next = fresh.getElementById(form.id);
        if (!next) return;
        // Repeated hidden columns/conditions are canonical server state. Replacing the complete
        // set also handles newly added or removed values without touching the search cursor.
        form.querySelectorAll('input[type="hidden"]').forEach(control => control.remove());
        const hidden = document.createDocumentFragment();
        next.querySelectorAll('input[type="hidden"]').forEach(control => hidden.append(document.importNode(control, true)));
        form.prepend(hidden);
        if (history !== 'none' && focus !== 'view') return;
        const data = new FormData(next);
        [...form.elements].forEach(control => {
          if (!control.name || ['hidden', 'submit', 'button'].includes(control.type)) return;
          if (control.multiple) [...control.options].forEach(option => { option.selected = data.getAll(control.name).includes(option.value); });
          else if (control.type === 'checkbox' || control.type === 'radio') control.checked = data.getAll(control.name).includes(control.value);
          else control.value = data.get(control.name) ?? '';
          control.dispatchEvent(new Event('pt:select-sync'));
        });
      });
    if (history !== 'none') window.history[history === 'replace' ? 'replaceState' : 'pushState']({ ptList: true }, '', target);
    window.PolytecUI?.enhanceListControls?.(workspace);
    if (focus === 'page') {
      workspace.querySelector('.pt-table-wrap--scroll')?.scrollTo({ top: 0 });
      const pager = workspace.querySelector('nav[aria-label] a');
      (pager || workspace.querySelector('.pt-table-wrap--scroll'))?.focus({ preventScroll: true });
    } else if (focused) {
      const control = document.getElementById(focused.id);
      if (control && control !== document.activeElement) {
        control.focus({ preventScroll: true });
        if (typeof focused.start === 'number' && control.setSelectionRange) control.setSelectionRange(focused.start, focused.end);
      }
    } else if (focus === 'view') {
      workspace.querySelector('[data-pt-manage-view]')?.focus({ preventScroll: true });
    }
    return true;
  } catch (problem) {
    if (problem.name === 'AbortError' || requests.get(workspace) !== controller) return false;
    // Preserve ordinary links/forms as the accessible, no-JavaScript and authentication fallback.
    if (!body) location.assign(url);
    else return false;
  } finally {
    if (requests.get(workspace) === controller) regions.forEach(region => region.removeAttribute('aria-busy'));
  }
  return false;
}

export function initListWorkspaces(root = document) {
  const workspaces = [...root.querySelectorAll('.pt-table-workspace')];
  if (root.matches?.('.pt-table-workspace')) workspaces.push(root);
  workspaces.forEach(workspace => {
    if (workspace.dataset.ptListReady) return;
    workspace.dataset.ptListReady = 'true';
    workspace.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
        || link.target || link.hasAttribute('download') || link.dataset.ptAction === 'cancel') return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash) return;
      if (!workspace.querySelector('[data-pt-live-results][id]')) return;
      event.preventDefault();
      if (editing(workspace)) {
        const editor = workspace.querySelector('[data-pt-table-editing="true"]');
        if (!editor?._ptTableDiscard || editor.getAttribute('aria-busy') === 'true') return;
        // The capture-phase unsaved-change guard has already confirmed a dirty departure.
        editor._ptTableDiscard();
      }
      refreshList(workspace, url, { focus: link.closest('nav') ? 'page' : 'view' });
    });
    workspace.addEventListener('submit', event => {
      const form = event.target;
      if (!form.matches('form[data-pt-list-apply]')) return;
      event.preventDefault();
      const url = new URL(form.action, location.href);
      const data = new FormData(form, event.submitter);
      url.search = new URLSearchParams(data).toString();
      refreshList(workspace, url, { focus: 'view' });
    });
  });
  if (root !== document || document.documentElement.dataset.ptListHistoryReady) return;
  document.documentElement.dataset.ptListHistoryReady = 'true';
  window.addEventListener('popstate', () => {
    document.querySelectorAll('.pt-table-workspace').forEach(workspace => {
      if (workspace.querySelector('[data-pt-live-results][id]') && !editing(workspace)) refreshList(workspace, location.href, { history: 'none', focus: 'view' });
    });
  });
  document.addEventListener('ops:refresh', event => {
    const workspace = document.querySelector('.pt-table-workspace:has([data-pt-live-results][id])');
    if (workspace && !editing(workspace)) { event.preventDefault(); refreshList(workspace, location.href, { history: 'replace' }); }
  });
}
