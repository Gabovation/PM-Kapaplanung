export function parsePlanningTSV(text, maxRows, maxCols) {
  // Ignore a spreadsheet's final line ending, not intentional empty cells.
  if (text.length > 1000000) return [];
  return text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n', maxRows)
    .map(line => line.split('\t', maxCols));
}

export function initPlanningGrids(root = document) {
  const grids = [...root.querySelectorAll('[data-pt-planning-grid]')];
  if (root.matches?.('[data-pt-planning-grid]')) grids.unshift(root);
  grids.forEach(grid => {
    if (grid.dataset.ptPlanningReady) return;
    grid.dataset.ptPlanningReady = 'true';
    const rows = [...grid.querySelectorAll('[data-pt-planning-row]')].map(row => [...row.querySelectorAll('[data-pt-planning-input]')]);
    const height = rows.length, width = rows[0]?.length || 0;
    if (!height || !width) return;
    const scroll = grid.querySelector('[data-pt-planning-scroll]');
    let anchor = null, active = null, filling = false, selected = new Set();
    const position = input => {
      const cell = input.closest('[data-row][data-col]');
      return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
    };
    const bounds = () => ({
      top: Math.min(anchor.row, active.row), bottom: Math.max(anchor.row, active.row),
      left: Math.min(anchor.col, active.col), right: Math.max(anchor.col, active.col),
    });
    const paint = () => {
      const area = bounds(), next = new Set();
      for (let r = area.top; r <= area.bottom; r++) for (let c = area.left; c <= area.right; c++)
        next.add(rows[r][c].parentElement);
      selected.forEach(cell => { if (!next.has(cell)) cell.classList.remove('is-selected'); });
      next.forEach(cell => { if (!selected.has(cell)) cell.classList.add('is-selected'); });
      selected = next;
    };
    const choose = (point, extend = false, focus = true) => {
      active = { row: Math.max(0, Math.min(height - 1, point.row)), col: Math.max(0, Math.min(width - 1, point.col)) };
      if (!extend || !anchor) anchor = { ...active };
      paint();
      if (!focus) return;
      const input = rows[active.row][active.col];
      input.focus({ preventScroll: true });
      input.select();
      const rect = input.getBoundingClientRect(), box = scroll.getBoundingClientRect();
      const left = box.left + grid.querySelector('[data-pt-planning-row] > th').getBoundingClientRect().width;
      const top = box.top + grid.querySelector('thead').getBoundingClientRect().height;
      if (rect.left < left) scroll.scrollLeft -= left - rect.left;
      else if (rect.right > box.right) scroll.scrollLeft += rect.right - box.right;
      if (rect.top < top) scroll.scrollTop -= top - rect.top;
      else if (rect.bottom > box.bottom) scroll.scrollTop += rect.bottom - box.bottom;
    };
    const setValues = values => {
      filling = true;
      try {
        values.forEach(({ input, value }) => {
          if (input.disabled || input.readOnly || input.value === value) return;
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      } finally { filling = false; }
    };
    const selectionValues = value => {
      const area = bounds(), values = [];
      for (let r = area.top; r <= area.bottom; r++) for (let c = area.left; c <= area.right; c++)
        values.push({ input: rows[r][c], value });
      return values;
    };
    grid.addEventListener('focusin', event => {
      if (!event.target.matches('[data-pt-planning-input]')) return;
      const point = position(event.target);
      if (!active || point.row !== active.row || point.col !== active.col) choose(point, false, false);
      event.target.select();
    });
    grid.addEventListener('pointerdown', event => {
      if (event.target.matches('[data-pt-planning-input]')) choose(position(event.target), event.shiftKey, false);
    });
    grid.addEventListener('click', event => {
      if (event.target.matches('[data-pt-planning-input]')) event.target.select();
    });
    grid.addEventListener('input', event => {
      if (filling || event.isComposing || !event.target.matches('[data-pt-planning-input]')) return;
      if (!active) choose(position(event.target), false, false);
      setValues(selectionValues(event.target.value));
    });
    grid.addEventListener('compositionend', event => {
      if (event.target.matches('[data-pt-planning-input]')) setValues(selectionValues(event.target.value));
    });
    grid.addEventListener('keydown', event => {
      if (!event.target.matches('[data-pt-planning-input]') || event.isComposing || event.altKey) return;
      if (!active) choose(position(event.target), false, false);
      const control = event.ctrlKey || event.metaKey;
      const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
      let next;
      if (delta) next = { row: active.row + delta[0], col: active.col + delta[1] };
      else if (event.key === 'Home' || event.key === 'End') next = {
        row: control ? (event.key === 'Home' ? 0 : height - 1) : active.row,
        col: event.key === 'Home' ? 0 : width - 1,
      };
      else if (event.key === 'Enter') next = { row: active.row + (event.shiftKey ? -1 : 1), col: active.col };
      if (next) { event.preventDefault(); choose(next, event.shiftKey && event.key !== 'Enter'); return; }
      if (control && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        const area = bounds(), values = [];
        for (let r = area.top + 1; r <= area.bottom; r++) for (let c = area.left; c <= area.right; c++)
          values.push({ input: rows[r][c], value: rows[area.top][c].value });
        setValues(values);
      } else if (event.key === 'Delete') { event.preventDefault(); setValues(selectionValues('')); }
      else if (event.key === 'Escape') choose(active);
    });
    grid.addEventListener('paste', event => {
      if (!event.target.matches('[data-pt-planning-input]') || !event.clipboardData) return;
      if (!active) choose(position(event.target), false, false);
      event.preventDefault();
      const area = bounds();
      const data = parsePlanningTSV(event.clipboardData.getData('text/plain'), height - area.top, width - area.left);
      if (!data.length) return;
      if (data.length === 1 && data[0].length === 1) { setValues(selectionValues(data[0][0])); return; }
      const values = [];
      data.forEach((line, r) => line.forEach((value, c) => values.push({ input: rows[area.top + r][area.left + c], value })));
      setValues(values);
      anchor = { row: area.top, col: area.left };
      active = { row: area.top + data.length - 1, col: area.left + Math.max(...data.map(line => line.length)) - 1 };
      paint();
      // Focus stays at the paste origin; the rectangle remains selected through autosave status updates.
    });
    grid.addEventListener('copy', event => {
      if (!event.target.matches('[data-pt-planning-input]') || !anchor || !event.clipboardData) return;
      const area = bounds();
      if (area.top === area.bottom && area.left === area.right) return;
      event.preventDefault();
      event.clipboardData.setData('text/plain', rows.slice(area.top, area.bottom + 1)
        .map(row => row.slice(area.left, area.right + 1).map(input => input.value).join('\t')).join('\n'));
    });
  });
}
