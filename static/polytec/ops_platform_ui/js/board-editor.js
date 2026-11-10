// Board editor (UI Kit 1.34.0): place, move and resize the tiles of a board on its fixed grid with
// pointer or keyboard. The page owns what a tile is (widget, options, title) and saving; the editor
// owns placement only and reports it with events on the board_editor() element.
const MOVE_THRESHOLD_PX = 4;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
const format = (text, values) => text.replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match));
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

class BoardEditor {
  constructor(root) {
    this.root = root;
    this.grid = root.querySelector('[data-ops-board-editor-grid]');
    this.cells = root.querySelector('[data-ops-board-editor-cells]');
    this.live = root.querySelector('[data-ops-board-editor-live]');
    this.template = root.querySelector('template[data-ops-board-editor-template]');
    this.columns = Number(root.dataset.columns) || 12;
    this.rows = Number(root.dataset.rows) || 6;
    this.drag = null;
    this.screen = root.querySelector('.ops-board-editor__screen');
    // Previews render at the real screen's size and are scaled down, so a widget looks in the
    // editor as it will on the display (data-screen-width/-height: the landscape resolution).
    new ResizeObserver(() => this.rescale()).observe(this.screen);
    this.renderCells();
    this.elements().forEach((tile) => this.describe(tile));
    this.grid.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.grid.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.grid.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.grid.addEventListener('pointercancel', () => this.cancelDrag());
    this.grid.addEventListener('keydown', (event) => this.onKeyDown(event));
    this.grid.addEventListener('click', (event) => this.onClick(event));
    this.grid.addEventListener('dblclick', (event) => {
      const tile = event.target.closest('[data-ops-board-editor-tile]');
      if (tile && !event.target.closest('button')) this.emit('ops:board-editor-edit', { id: tile.dataset.opsBoardEditorTile });
    });
  }

  // --- public API ------------------------------------------------------------------------------

  tiles() {
    return this.elements().map((tile) => ({ id: tile.dataset.opsBoardEditorTile, ...this.rect(tile) }));
  }

  // Places a new tile at the first free spot (at its size, else at its minimum size); null when the
  // board has no room left.
  add({ id, title, w = 4, h = 3, minW = 1, minH = 1, frameSrc = null }) {
    const size = { w: clamp(w, minW, this.columns), h: clamp(h, minH, this.rows) };
    const spot = this.firstFree(size.w, size.h) || this.firstFree(minW, minH);
    if (!spot) {
      this.announce(this.root.dataset.textFull);
      return null;
    }
    const tile = this.template.content.firstElementChild.cloneNode(true);
    tile.dataset.opsBoardEditorTile = id;
    tile.dataset.minW = String(minW);
    tile.dataset.minH = String(minH);
    this.grid.append(tile);
    this.place(tile, spot);
    this.update(id, { title, frameSrc });
    this.changed(tile);
    tile.focus();
    return tile;
  }

  update(id, { title, frameSrc, minW, minH } = {}) {
    const tile = this.find(id);
    if (!tile) return;
    if (title !== undefined) {
      const heading = tile.querySelector('[data-ops-board-editor-title]');
      heading.textContent = title;
      heading.title = title;
      tile.querySelector('[data-ops-board-editor-frame]').title = title;
    }
    if (frameSrc !== undefined) {
      const frame = tile.querySelector('[data-ops-board-editor-frame]');
      frame.parentElement.hidden = !frameSrc;
      if (frameSrc && frame.getAttribute('src') !== frameSrc) frame.setAttribute('src', frameSrc);
    }
    if (minW !== undefined) tile.dataset.minW = String(minW);
    if (minH !== undefined) tile.dataset.minH = String(minH);
    this.describe(tile);
  }

  remove(id) {
    const tile = this.find(id);
    if (!tile) return;
    const title = this.title(tile);
    const next = tile.nextElementSibling?.matches('[data-ops-board-editor-tile]') ? tile.nextElementSibling : null;
    tile.remove();
    this.announce(format(this.root.dataset.textRemoved, { title }));
    this.emit('ops:board-editor-change', { tiles: this.tiles() });
    (next || this.elements()[0])?.focus();
  }

  // Changes the grid when every tile still fits; returns false (and keeps the grid) otherwise.
  setGrid(columns, rows) {
    if (this.elements().some((tile) => { const r = this.rect(tile); return r.x + r.w > columns || r.y + r.h > rows; })) return false;
    this.columns = columns;
    this.rows = rows;
    this.root.dataset.columns = String(columns);
    this.root.dataset.rows = String(rows);
    this.root.style.setProperty('--ops-board-columns', String(columns));
    this.root.style.setProperty('--ops-board-rows', String(rows));
    this.renderCells();
    this.emit('ops:board-editor-change', { tiles: this.tiles() });
    return true;
  }

  setOrientation(orientation) {
    this.root.dataset.orientation = orientation === 'portrait' ? 'portrait' : 'landscape';
    this.rescale();
  }

  rescale() {
    const long = Number(this.root.dataset.screenWidth) || 1920;
    const short = Number(this.root.dataset.screenHeight) || 1080;
    const width = this.root.dataset.orientation === 'portrait' ? short : long;
    const scale = this.screen.clientWidth / width;
    if (scale > 0) this.root.style.setProperty('--ops-board-editor-scale', String(Math.min(scale, 1)));
  }

  focus(id) {
    this.find(id)?.focus();
  }

  // --- placement -------------------------------------------------------------------------------

  elements() {
    return [...this.grid.querySelectorAll(':scope > [data-ops-board-editor-tile]')];
  }

  find(id) {
    return this.elements().find((tile) => tile.dataset.opsBoardEditorTile === id) || null;
  }

  rect(tile) {
    return { x: Number(tile.dataset.x), y: Number(tile.dataset.y), w: Number(tile.dataset.w), h: Number(tile.dataset.h) };
  }

  title(tile) {
    return tile.querySelector('[data-ops-board-editor-title]').textContent.trim();
  }

  place(tile, rect) {
    for (const key of ['x', 'y', 'w', 'h']) {
      tile.dataset[key] = String(rect[key]);
      tile.style.setProperty(`--ops-slot-${key}`, String(key === 'x' || key === 'y' ? rect[key] + 1 : rect[key]));
    }
  }

  fits(rect, except) {
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > this.columns || rect.y + rect.h > this.rows) return false;
    return this.elements().every((tile) => tile === except || !overlaps(rect, this.rect(tile)));
  }

  firstFree(w, h) {
    for (let y = 0; y + h <= this.rows; y += 1) {
      for (let x = 0; x + w <= this.columns; x += 1) {
        if (this.fits({ x, y, w, h }, null)) return { x, y, w, h };
      }
    }
    return null;
  }

  renderCells() {
    this.cells.replaceChildren(...Array.from({ length: this.columns * this.rows }, () => document.createElement('span')));
  }

  describe(tile) {
    const r = this.rect(tile);
    const text = format(this.root.dataset.textPosition, { title: this.title(tile), x: r.x + 1, y: r.y + 1, w: r.w, h: r.h });
    tile.setAttribute('aria-label', text);
    return text;
  }

  changed(tile) {
    this.announce(this.describe(tile));
    this.emit('ops:board-editor-change', { tiles: this.tiles() });
  }

  announce(text) {
    this.live.textContent = '';
    window.requestAnimationFrame(() => { this.live.textContent = text; });
  }

  emit(name, detail, cancelable = false) {
    return this.root.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, cancelable }));
  }

  // --- pointer ---------------------------------------------------------------------------------

  cellAt(event) {
    const box = this.grid.getBoundingClientRect();
    return {
      x: clamp(Math.floor(((event.clientX - box.left) / box.width) * this.columns), 0, this.columns - 1),
      y: clamp(Math.floor(((event.clientY - box.top) / box.height) * this.rows), 0, this.rows - 1),
    };
  }

  onPointerDown(event) {
    const tile = event.target.closest('[data-ops-board-editor-tile]');
    if (!tile || event.button !== 0 || event.target.closest('button')) return;
    const start = this.rect(tile);
    const cell = this.cellAt(event);
    const resize = Boolean(event.target.closest('[data-ops-board-editor-resize]'));
    this.drag = { tile, start, resize, grab: { x: cell.x - start.x, y: cell.y - start.y }, from: { x: event.clientX, y: event.clientY }, active: false };
    tile.setPointerCapture(event.pointerId);
    if (resize) event.preventDefault();
  }

  onPointerMove(event) {
    const drag = this.drag;
    if (!drag) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.from.x, event.clientY - drag.from.y) < MOVE_THRESHOLD_PX) return;
      drag.active = true;
      drag.tile.classList.add('is-dragging');
      drag.tile.focus();
    }
    const cell = this.cellAt(event);
    const { start, tile } = drag;
    const target = drag.resize
      ? { x: start.x, y: start.y, w: clamp(cell.x - start.x + 1, Number(tile.dataset.minW), this.columns - start.x), h: clamp(cell.y - start.y + 1, Number(tile.dataset.minH), this.rows - start.y) }
      : { x: clamp(cell.x - drag.grab.x, 0, this.columns - start.w), y: clamp(cell.y - drag.grab.y, 0, this.rows - start.h), w: start.w, h: start.h };
    this.place(tile, target);
    tile.classList.toggle('is-blocked', !this.fits(target, tile));
  }

  onPointerUp() {
    const drag = this.drag;
    this.drag = null;
    if (!drag?.active) return;
    const { tile, start } = drag;
    tile.classList.remove('is-dragging');
    if (tile.classList.contains('is-blocked')) {
      tile.classList.remove('is-blocked');
      this.place(tile, start);
      this.announce(this.root.dataset.textBlocked);
      return;
    }
    const moved = this.rect(tile);
    if (['x', 'y', 'w', 'h'].some((key) => moved[key] !== start[key])) this.changed(tile);
  }

  cancelDrag() {
    if (!this.drag) return;
    const { tile, start } = this.drag;
    this.drag = null;
    tile.classList.remove('is-dragging', 'is-blocked');
    this.place(tile, start);
  }

  // --- keyboard and actions --------------------------------------------------------------------

  onKeyDown(event) {
    const tile = event.target;
    if (!tile.matches?.('[data-ops-board-editor-tile]')) return;
    const id = tile.dataset.opsBoardEditorTile;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.emit('ops:board-editor-edit', { id });
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (this.emit('ops:board-editor-remove', { id }, true)) this.remove(id);
      return;
    }
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!step) return;
    event.preventDefault();
    const r = this.rect(tile);
    const target = event.shiftKey
      ? { ...r, w: Math.max(Number(tile.dataset.minW), r.w + step[0]), h: Math.max(Number(tile.dataset.minH), r.h + step[1]) }
      : { ...r, x: r.x + step[0], y: r.y + step[1] };
    if (target.w === r.w && target.h === r.h && target.x === r.x && target.y === r.y) return;
    if (!this.fits(target, tile)) {
      this.announce(this.root.dataset.textBlocked);
      return;
    }
    this.place(tile, target);
    this.changed(tile);
  }

  onClick(event) {
    const button = event.target.closest('[data-ops-board-editor-action]');
    if (!button) return;
    const id = button.closest('[data-ops-board-editor-tile]').dataset.opsBoardEditorTile;
    if (button.dataset.opsBoardEditorAction === 'edit') this.emit('ops:board-editor-edit', { id });
    else if (this.emit('ops:board-editor-remove', { id }, true)) this.remove(id);
  }
}

document.querySelectorAll('[data-ops-board-editor]').forEach((root) => {
  if (root.opsBoardEditor) return;
  root.opsBoardEditor = new BoardEditor(root);
  root.dispatchEvent(new CustomEvent('ops:board-editor-ready', { bubbles: true }));
});
