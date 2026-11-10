import { scheduleScrollDelta } from './schedule-board.js';

let boardId = 0;

export function timeBoardSlot(x, rect, start, end, step) {
  if (![x, rect.left, rect.width, start, end, step].every(Number.isFinite) ||
      rect.width <= 0 || end <= start || step <= 0) return null;
  const maximum = Math.floor((end - start - 1) / step) * step;
  const offset = Math.floor(((x - rect.left) / rect.width * (end - start)) / step) * step;
  return start + Math.max(0, Math.min(maximum, offset));
}

export function initTimeBoards(root = document) {
  const boards = [...root.querySelectorAll('[data-pt-time-board]')];
  if (root.matches?.('[data-pt-time-board]')) boards.unshift(root);
  boards.forEach(board => {
    if (board.dataset.ptTimeReady) return;
    board.dataset.ptTimeReady = 'true';
    const scroll = board.querySelector('[data-pt-time-scroll]');
    const tracks = [...board.querySelectorAll('[data-pt-time-track]')];
    const status = board.querySelector('[data-pt-time-status]');
    const instructions = board.querySelector('[data-pt-time-instructions]');
    const cancel = board.querySelector('[data-pt-time-cancel]');
    const start = Number(board.dataset.start), end = Number(board.dataset.end);
    const step = Number(board.dataset.step) * 60000;
    let formatter;
    try {
      if (board.dataset.valid !== '1' || ![start, end, step].every(Number.isSafeInteger) || end <= start || step <= 0 ||
          !Number.isFinite(new Date(start).getTime()) || !Number.isFinite(new Date(end - 1).getTime())) throw new RangeError();
      formatter = new Intl.DateTimeFormat(board.dataset.locale, {
        timeZone: board.dataset.timezone, weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit',
      });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      status.textContent = board.dataset.configurationError;
      return;
    }
    if (!scroll || !tracks.length) return;
    const view = board.querySelector('[data-pt-time-view]');
    const fitView = () => {
      if (!view) return;
      const table = scroll.querySelector('table');
      const labelWidth = table.querySelector('th').getBoundingClientRect().width;
      const option = view.selectedOptions[0];
      const hours = Number(option.dataset.hours || 0);
      const oldWidth = table.getBoundingClientRect().width - labelWidth;
      const position = oldWidth > 0 ? scroll.scrollLeft / oldWidth : 0;
      const span = hours > 0 ? hours * 3600000 : view.value === 'week' ? end - start : Number(option.dataset.end) - Number(view.value);
      if (!(span > 0)) return;
      const minDay = parseFloat(getComputedStyle(board).getPropertyValue('--polytec-schedule-day-width')) || 192;
      const available = Math.max(1, scroll.clientWidth - labelWidth);
      const width = !hours && view.value === 'week' ? Math.max(available, minDay * (end - start) / 86400000)
        : available * (end - start) / span;
      table.style.setProperty('--pt-time-table-width', `${labelWidth + width}px`);
      table.style.inlineSize = `${labelWidth + width}px`;
      table.style.maxInlineSize = `${labelWidth + width}px`;
      scroll.scrollLeft = hours ? position * width : view.value === 'week' ? 0 : (Number(view.value) - start) / (end - start) * width;
    };
    view?.addEventListener('change', fitView);
    fitView();
    const resize = new ResizeObserver(fitView);
    resize.observe(scroll);
    instructions.id = `pt-time-instructions-${++boardId}`;
    scroll.setAttribute('aria-describedby', instructions.id);
    board.querySelectorAll('[data-pt-time-handle]').forEach(handle => {
      handle.hidden = false;
      handle.setAttribute('aria-describedby', instructions.id);
    });

    board.querySelector('[data-pt-time-search]')?.addEventListener('input', event => {
      const terms = event.target.value.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      board.querySelectorAll('.pt-time-board__backlog [data-pt-time-item]').forEach(item => {
        const text = item.textContent.toLocaleLowerCase();
        item.hidden = !terms.every(term => text.includes(term));
      });
    });
    let active = null, pending = null, target = null, marker = null, ghost = null;
    let tooltip = null, tooltipTarget = null, tooltipTimer;
    const tooltipSession = new AbortController();
    const hideTooltip = () => {
      clearTimeout(tooltipTimer);
      tooltip?.remove(); tooltip = null;
      if (tooltipTarget) {
        tooltipTarget.removeAttribute('aria-describedby');
        tooltipTarget.title = tooltipTarget.dataset.timeTooltip || '';
      }
      tooltipTarget = null;
    };
    const tooltipObserver = new MutationObserver(() => {
      if (!board.isConnected) { hideTooltip(); tooltipSession.abort(); tooltipObserver.disconnect(); resize.disconnect(); }
    });
    tooltipObserver.observe(document.body, { childList: true, subtree: true });
    const showTooltip = item => {
      if (active || !item || tooltipTarget === item) return;
      hideTooltip();
      tooltipTarget = item;
      const description = item.dataset.timeTooltip || item.title;
      item.dataset.timeTooltip = description;
      item.removeAttribute('title');
      item.querySelectorAll('a[title]').forEach(link => link.removeAttribute('title'));
      tooltip = document.createElement('div');
      tooltip.id = `${instructions.id}-tooltip`;
      tooltip.className = 'pt-time-board__tooltip'; tooltip.role = 'tooltip';
      const title = document.createElement('strong'); title.textContent = item.dataset.title;
      tooltip.append(title);
      for (const line of description.split(' · ')) {
        const row = document.createElement('div'); row.textContent = line; tooltip.append(row);
      }
      document.body.append(tooltip);
      item.setAttribute('aria-describedby', tooltip.id);
      const rect = item.getBoundingClientRect(), box = tooltip.getBoundingClientRect();
      tooltip.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - box.width - 8))}px`;
      tooltip.style.top = `${Math.max(8, Math.min(rect.bottom + 8, innerHeight - box.height - 8))}px`;
      tooltip.addEventListener('pointerenter', () => clearTimeout(tooltipTimer));
      tooltip.addEventListener('pointerleave', hideTooltip);
    };
    board.addEventListener('pointerover', event => showTooltip(event.target.closest('[data-pt-time-visual]')));
    board.addEventListener('pointerout', event => {
      if (tooltipTarget && !tooltipTarget.contains(event.relatedTarget)) tooltipTimer = setTimeout(hideTooltip, 150);
    });
    board.addEventListener('focusin', event => showTooltip(event.target.closest('[data-pt-time-visual]')));
    board.addEventListener('focusout', hideTooltip);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); }, { signal: tooltipSession.signal });
    board.addEventListener('click', hideTooltip);
    board.addEventListener('pointerdown', hideTooltip);
    scroll.addEventListener('scroll', hideTooltip, { passive: true });
    let frame = 0, previousTime = 0, session = null, observer = null, queuedReview = null;
    const announce = text => { status.textContent = text; };
    const valid = item => {
      const url = item?.dataset.url;
      if (!item?.dataset.key || !url || url.includes(':') || url.includes('\\') || url.startsWith('//')) return false;
      try {
        const parsed = new URL(url, location.href);
        return ['http:', 'https:', 'file:'].includes(parsed.protocol) && parsed.origin === location.origin;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        return false;
      }
    };
    const emitReview = (detail, pointerType) => {
      const dispatch = () => {
        if (board.isConnected) board.dispatchEvent(new CustomEvent('pt:time-drop', { bubbles: true, detail }));
      };
      if (!pointerType) { dispatch(); return; }
      const controller = new AbortController();
      let closed = false, timer;
      const removal = new MutationObserver(() => { if (!board.isConnected) clear(); });
      const clear = () => {
        closed = true; clearTimeout(timer); controller.abort(); removal.disconnect(); queuedReview = null;
      };
      const deliver = () => { if (!closed) { clear(); dispatch(); } };
      queuedReview = clear;
      document.addEventListener('click', event => {
        if (event.pointerType && event.pointerType !== pointerType) return;
        event.preventDefault(); event.stopImmediatePropagation(); queueMicrotask(deliver);
      }, { capture: true, signal: controller.signal });
      window.addEventListener('pagehide', clear, { signal: controller.signal });
      window.addEventListener('blur', clear, { signal: controller.signal });
      document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); }, { signal: controller.signal });
      removal.observe(document.body, { childList: true, subtree: true });
      timer = setTimeout(deliver, pointerType === 'touch' ? 350 : 0);
    };
    const watchSession = () => {
      if (session) return;
      session = new AbortController();
      const options = { signal: session.signal };
      window.addEventListener('blur', () => finish(), options);
      window.addEventListener('pagehide', () => finish(), options);
      document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); }, options);
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); finish(); }
      }, options);
      observer = new MutationObserver(() => { if (!board.isConnected) finish(); });
      observer.observe(document.body, { childList: true, subtree: true });
    };
    const reveal = chosen => {
      const box = scroll.getBoundingClientRect(), track = chosen.track.getBoundingClientRect();
      const lane = board.querySelector('tbody th[scope="row"]').getBoundingClientRect();
      const header = board.querySelector('thead').getBoundingClientRect();
      const x = track.left + track.width * (chosen.time - start) / (end - start);
      const left = box.left + lane.width, top = box.top + header.height;
      if (x < left) scroll.scrollLeft -= left - x;
      else if (x > box.right) scroll.scrollLeft += x - box.right;
      if (track.top < top) scroll.scrollTop -= top - track.top;
      else if (track.bottom > box.bottom) scroll.scrollTop += track.bottom - box.bottom;
    };
    const choose = (chosen, keyboard = false) => {
      let preview;
      try { preview = JSON.parse(active?.item.dataset.previewByLane || '{}')[chosen?.track.dataset.laneKey]; } catch { /* Invalid optional preview data uses the item's duration. */ }
      const duration = Number(preview?.duration || active?.item.dataset.duration || 0);
      if (chosen && duration > 0 && Number(chosen.track.dataset.capacity || 1) === 1) {
        // Mirror single-capacity placement: find the first complete free interval after the pointer.
        const bookings = [...chosen.track.querySelectorAll('[data-pt-time-visual]')]
          .filter(item => item.dataset.key !== active.item.dataset.key)
          .map(item => [Number(item.dataset.itemStart), Number(item.dataset.itemEnd)])
          .sort((a, b) => a[0] - b[0]);
        let time = chosen.time;
        for (const [begin, finish] of bookings) {
          if (time < finish && begin < time + duration) time = start + Math.ceil((finish - start) / step) * step;
        }
        chosen = { ...chosen, time };
      }
      if (chosen && chosen.time >= end) chosen = null;
      if (target?.track === chosen?.track && target?.time === chosen?.time) return;
      marker?.remove();
      marker = null;
      target = chosen;
      if (!chosen) { announce(board.dataset.invalid); return; }
      marker = document.createElement('span');
      marker.className = 'pt-time-board__marker';
      marker.setAttribute('aria-hidden', 'true');
      if (duration > 0) {
        marker.classList.add('pt-time-board__marker--preview');
        marker.style.inlineSize = `${Math.max(0, Math.min(duration, end - chosen.time)) * 100 / (end - start)}%`;
        marker.textContent = active.item.dataset.title;
        const offRouting = active.item.dataset.workCentre && active.item.dataset.workCentre !== chosen.track.dataset.laneKey;
        marker.dataset.estimate = offRouting && !preview ? 'true' : 'false';
      }
      marker.style.insetInlineStart = `${(chosen.time - start) * 100 / (end - start)}%`;
      chosen.track.append(marker);
      if (keyboard) reveal(chosen);
      announce(`${board.dataset.target}: ${chosen.track.dataset.laneLabel}, ${formatter.format(new Date(chosen.time))}.`);
    };
    function finish(review = false) {
      const move = active, destination = target, pointer = pending;
      active = null; pending = null; target = null;
      cancelAnimationFrame(frame); previousTime = 0;
      marker?.remove(); marker = null;
      ghost?.remove(); ghost = null;
      session?.abort(); session = null;
      observer?.disconnect(); observer = null;
      cancel.hidden = true;
      if (pointer?.captor.hasPointerCapture(pointer.id)) pointer.captor.releasePointerCapture(pointer.id);
      if (!move) return;
      move.handle?.setAttribute('aria-pressed', 'false');
      if (board.isConnected && !document.hidden) (move.handle || move.item.querySelector('a'))?.focus({ preventScroll: true });
      announce(review && destination ? board.dataset.reviewing : board.dataset.cancelled);
      if (review && destination && valid(move.item) && board.contains(move.item)) {
        emitReview({ key: move.item.dataset.key, laneKey: destination.track.dataset.laneKey, start: destination.time }, pointer?.pointerType);
      }
    }
    const begin = (item, handle = null, pointerId = null) => {
      if (!valid(item)) return false;
      if (active) finish();
      hideTooltip();
      watchSession();
      active = { item, handle, pointerId };
      handle?.setAttribute('aria-pressed', 'true');
      cancel.hidden = false;
      announce(`${board.dataset.pickedUp}: ${item.dataset.title}.`);
      if (pointerId === null) {
        const itemStart = Number(item.dataset.itemStart);
        const initial = Number.isFinite(itemStart) ? itemStart : start;
        const time = timeBoardSlot(initial, { left: start, width: end - start }, start, end, step);
        const track = item.closest('tr')?.querySelector('[data-pt-time-track]') || tracks[0];
        choose({ track, time }, true);
      }
      return true;
    };
    const hit = (x, y) => {
      const track = document.elementFromPoint(x, y)?.closest('[data-pt-time-track]');
      if (!track || !board.contains(track)) return null;
      const time = timeBoardSlot(x, track.getBoundingClientRect(), start, end, step);
      return time === null ? null : { track, time };
    };
    const tick = time => {
      if (!active || !pending) return;
      const box = scroll.getBoundingClientRect(), { x, y } = pending;
      const destination = hit(x, y);
      const inside = x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
      const delta = inside ? scheduleScrollDelta(x, y, box, previousTime ? time - previousTime : 16) : { x: 0, y: 0 };
      previousTime = time;
      choose(destination);
      scroll.scrollLeft += delta.x; scroll.scrollTop += delta.y;
      ghost.style.transform = `translate3d(${x + 8}px, ${y + 8}px, 0)`;
      frame = requestAnimationFrame(tick);
    };
    board.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || active || pending || queuedReview) return;
      const handle = event.target.closest('[data-pt-time-handle]');
      const item = event.target.closest('[data-pt-time-item]');
      const visual = event.target.closest('[data-pt-time-visual]');
      if (!handle && (!visual || visual.dataset.movable !== '1' || event.pointerType === 'touch')) return;
      if (!item || !valid(item)) return;
      pending = { item, handle, captor: handle || event.target, id: event.pointerId, pointerType: event.pointerType,
        startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY };
      watchSession();
      pending.captor.setPointerCapture(event.pointerId);
    });
    board.addEventListener('pointermove', event => {
      if (!pending || pending.id !== event.pointerId) return;
      pending.x = event.clientX; pending.y = event.clientY;
      if (!active && Math.hypot(pending.x - pending.startX, pending.y - pending.startY) >= 8) {
        if (!begin(pending.item, pending.handle, event.pointerId)) { finish(); return; }
        ghost = document.createElement('div');
        ghost.className = 'pt-time-board__ghost'; ghost.textContent = pending.item.dataset.title;
        ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
        document.body.append(ghost);
        frame = requestAnimationFrame(tick);
      }
      if (active) event.preventDefault();
    });
    board.addEventListener('pointerup', event => {
      if (!pending || pending.id !== event.pointerId) return;
      if (active) { event.preventDefault(); choose(hit(event.clientX, event.clientY)); finish(Boolean(target)); }
      else finish();
    });
    board.addEventListener('pointercancel', () => finish());
    board.addEventListener('lostpointercapture', () => { if (pending) finish(); });
    board.addEventListener('click', event => {
      const handle = event.target.closest('[data-pt-time-handle]');
      if (!handle) return;
      event.preventDefault();
      if (!active) begin(handle.closest('[data-pt-time-item]'), handle);
    });
    board.addEventListener('keydown', event => {
      const handle = event.target.closest('[data-pt-time-handle]');
      if (event.key === 'Tab' && active) { finish(); return; }
      if (!handle) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (!active) begin(handle.closest('[data-pt-time-item]'), handle);
        return;
      }
      if (!active || active.handle !== handle || active.pointerId !== null) return;
      if (event.key === 'Enter') { event.preventDefault(); finish(true); return; }
      const row = tracks.indexOf(target.track);
      let next = { ...target };
      if (event.key === 'ArrowLeft') next.time = Math.max(start, target.time - step);
      else if (event.key === 'ArrowRight') next.time = Math.min(start + Math.floor((end - start - 1) / step) * step, target.time + step);
      else if (event.key === 'ArrowUp') next.track = tracks[Math.max(0, row - 1)];
      else if (event.key === 'ArrowDown') next.track = tracks[Math.min(tracks.length - 1, row + 1)];
      else return;
      event.preventDefault(); choose(next, true);
    });
    board.addEventListener('focusout', event => { if (active && !board.contains(event.relatedTarget)) finish(); });
    cancel.addEventListener('click', () => finish());
    board.addEventListener('dragstart', event => event.preventDefault());
    board.addEventListener('dragover', event => event.preventDefault());
    board.addEventListener('drop', event => { event.preventDefault(); finish(); });
  });
}
