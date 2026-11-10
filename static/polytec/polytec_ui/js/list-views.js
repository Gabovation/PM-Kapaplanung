// View editing is presentation only. App endpoints validate every field, revision and scope.
function inputField(label, name, value, options = null, { type = 'text' } = {}) {
  const field = document.createElement('label');
  field.className = 'pt-field';
  const caption = document.createElement('span'); caption.className = 'pt-field__label'; caption.textContent = label;
  const control = document.createElement(options ? 'select' : 'input');
  control.className = options ? 'pt-select' : 'pt-input'; control.name = name;
  if (options) options.forEach(([key, text]) => control.add(new Option(text, key, key === value, key === value)));
  else { control.type = type; control.value = control.defaultValue = value ?? ''; control.maxLength = 200; }
  field.append(caption, control);
  return field;
}

function conditionInputs(field, index, op, value, labels) {
  const body = document.createElement('div'); body.className = 'pt-view-fields';
  if (!field.operators.some(([key]) => key === op)) op = 'eq';
  body.append(inputField(labels.comparison, `op${index}`, op, field.operators));
  if (!['present', 'missing'].includes(op)) {
    body.append(inputField(labels.value, `value${index}`, value,
      field.options ? [['', labels.choose_value], ...field.options] : null, { type: field.type === 'date' ? 'date' : 'text' }));
  }
  return body;
}

function renderConditions(host, config, fields) {
  // One empty row is offered at a time; further rows appear once it is used.
  const syncRows = () => {
    let emptyShown = false;
    [...host.children].forEach(row => {
      const selected = row.querySelector('[data-pt-condition-field]').value;
      row.hidden = !selected && emptyShown;
      if (!selected) emptyShown = true;
    });
  };
  for (let index = 0; index < config.max_conditions; index += 1) {
    const key = config.state[`field${index}`] || '';
    const row = document.createElement('div'); row.className = 'pt-view-condition';
    const picker = inputField(`${config.labels.field} ${index + 1}`, `field${index}`, key,
      [['', config.labels.no_condition], ...config.fields.map(field => [field.key, field.unit ? `${field.label} (${field.unit})` : field.label])]);
    const select = picker.querySelector('select'); select.dataset.ptConditionField = '';
    const values = document.createElement('div');
    row.append(picker, values);
    const render = (op = 'eq', value = '') => {
      values.replaceChildren();
      const field = fields.get(select.value);
      if (field) values.append(conditionInputs(field, index, op, value, config.labels));
      syncRows();
    };
    render(config.state[`op${index}`] || 'eq', config.state[`value${index}`] || '');
    row._ptRestoreCondition = () => { select.value = key; render(config.state[`op${index}`] || 'eq', config.state[`value${index}`] || ''); };
    select.addEventListener('change', () => render());
    values.addEventListener('change', event => {
      if (event.target.name === `op${index}`) render(event.target.value, values.querySelector(`[name="value${index}"]`)?.value || '');
    });
    host.append(row);
  }
  syncRows();
}

export function initListViews(root = document) {
  const bars = [...root.querySelectorAll('[data-pt-list-views]')];
  if (root.matches?.('[data-pt-list-views]')) bars.push(root);
  bars.forEach(bar => {
    if (bar.dataset.ptViewReady) return;
    bar.dataset.ptViewReady = 'true';
    const config = JSON.parse(bar.querySelector('[data-pt-view-config]').textContent);
    const workspace = bar.closest('.pt-table-workspace');
    const form = bar.querySelector('[data-pt-view-editor]');
    const dialog = form.closest('dialog');
    const feedback = bar.querySelector('[data-pt-view-feedback]');
    bar.querySelector('[data-pt-manage-view]').hidden = false;
    const host = bar.querySelector('[data-pt-view-conditions]');
    if (host) renderConditions(host, config, new Map(config.fields.map(field => [field.key, field])));
    const columnBody = bar.querySelector('[data-pt-view-columns]');
    const columnRows = () => [...columnBody.children];
    const buildColumns = () => {
      if (columnBody.children.length) return;
      const template = bar.querySelector('[data-pt-view-column-template]').content.firstElementChild;
      config.columns.forEach(column => {
        const row = template.cloneNode(true);
        row.dataset.ptViewColumn = column.key;
        const box = row.querySelector('input[type="checkbox"]');
        box.value = column.key;
        box.checked = box.defaultChecked = column.selected;
        row.querySelector('[data-pt-view-column-label]').textContent = column.label;
        if (column.required) {
          box.disabled = true;
          delete row.dataset.ptSortItem;
          const kept = document.createElement('input'); kept.type = 'hidden'; kept.name = 'columns'; kept.value = column.key;
          box.closest('label').after(kept);
          row.querySelector('.pt-sort-controls').replaceWith(config.labels.required);
        }
        columnBody.append(row);
      });
    };
    bar.querySelector('[data-pt-manage-view]').addEventListener('click', buildColumns);
    dialog.addEventListener('close', () => {
      form.reset();
      columnBody.replaceChildren();
      bar.querySelector('[data-pt-view-column-search]').value = '';
      [...(host?.children || [])].forEach(row => row._ptRestoreCondition());
      form.querySelectorAll('select').forEach(select => select.dispatchEvent(new Event('pt:select-sync')));
      delete form.dataset.ptDirty;
      feedback.textContent = '';
    });
    bar.querySelector('[data-pt-view-column-search]').addEventListener('input', event => {
      const term = event.target.value.trim().toLocaleLowerCase();
      columnRows().forEach(row => { row.hidden = !row.textContent.toLocaleLowerCase().includes(term); });
    });
    const send = async (url, extras) => {
      const address = new URL(url, location.href);
      if (address.origin !== location.origin) return;
      const data = new FormData(form);
      data.set(config.csrf_name, config.csrf);
      Object.entries(extras).forEach(([key, value]) => data.set(key, value ?? ''));
      feedback.textContent = '';
      const controls = [...dialog.querySelectorAll('button, input, select, textarea')];
      controls.forEach(control => { control._ptViewDisabled = control.disabled; control.disabled = true;
        if (control.tagName === 'SELECT') control.dispatchEvent(new Event('pt:select-sync')); });
      form.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch(address, { method: 'POST', body: data, credentials: 'same-origin',
          redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
        const result = await response.json();
        if (!response.ok || !result.location) throw new Error(result.message || config.labels.save_failed);
        delete form.dataset.ptDirty;
        if (!await window.PolytecUI.refreshList(workspace, result.location, { focus: 'view' })) feedback.textContent = config.labels.save_failed;
      } catch (problem) {
        feedback.textContent = problem instanceof SyntaxError || problem instanceof TypeError || problem.name === 'TimeoutError'
          ? config.labels.save_failed : problem.message;
      } finally {
        form.removeAttribute('aria-busy');
        controls.forEach(control => { control.disabled = control._ptViewDisabled; delete control._ptViewDisabled;
          if (control.tagName === 'SELECT') control.dispatchEvent(new Event('pt:select-sync')); });
      }
    };
    dialog.addEventListener('click', event => {
      if (event.target.closest('[data-pt-view-save]')) {
        const nameInput = bar.querySelector('[data-pt-view-name]');
        const name = nameInput.value.trim();
        if (!name) { feedback.textContent = config.labels.enter_name; nameInput.focus(); return; }
        send(config.save_url, { view_name: name, view_scope: bar.querySelector('[data-pt-view-scope]')?.value || 'personal',
          view_id: event.target.closest('[data-pt-view-save]').dataset.ptViewSave === 'update' ? config.current.id : '',
          view_revision: config.current?.revision ?? '' });
      }
      const defaults = event.target.closest('[data-pt-view-default]');
      if (defaults) {
        const scope = defaults.dataset.ptViewDefault;
        if (scope !== 'reset' && (config.adjusted || form.dataset.ptDirty === 'true')) { feedback.textContent = config.labels.save_first; return; }
        send(config.default_url, { default_scope: scope, view_id: config.current?.id || '' });
      }
      if (event.target.closest('[data-pt-view-delete]')) send(config.delete_url, { view_id: config.current.id, view_revision: config.current.revision });
    });
  });
}
