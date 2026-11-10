let boardId = 0;

export function scheduleScrollDelta(x, y, box, elapsed = 16) {
  const edge = 48, speed = 600 * Math.min(32, Math.max(0, elapsed)) / 1000;
  const ramp = distance => Math.max(0, Math.min(1, (edge - distance) / edge)) ** 2;
  if (x < box.left - edge || x > box.right + edge || y < box.top - edge || y > box.bottom + edge) return { x: 0, y: 0 };
  return { x: speed * (ramp(box.right - x) - ramp(x - box.left)),
    y: speed * (ramp(box.bottom - y) - ramp(y - box.top)) };
}

export function initScheduleBoards(root = document) {
  const boards = [...root.querySelectorAll('[data-pt-schedule-board]')];
  if (root.matches?.('[data-pt-schedule-board]')) boards.unshift(root);
  boards.forEach(board => {
    if (board.dataset.ptScheduleReady) return;
    board.dataset.ptScheduleReady = 'true';
    const cells = [...board.querySelectorAll('[data-pt-schedule-cell]')];
    const scroll = board.querySelector('[data-pt-schedule-scroll]');
    const status = board.querySelector('[data-pt-schedule-status]');
    const instructions = board.querySelector('[data-pt-schedule-instructions]');
    const cancel = board.querySelector('[data-pt-schedule-cancel]');
    instructions.id = `pt-schedule-instructions-${++boardId}`;
    scroll?.setAttribute('aria-describedby', instructions.id);
    let active = null, pending = null, target = null, frame = 0, suppressClick = false;
    let ghost = null, session = null, removalObserver = null, previousTime = 0, queuedReview = null;
    const emitReview = (detail, pointerType) => {
      const dispatch = () => {
        if (board.isConnected) board.dispatchEvent(new CustomEvent('pt:schedule-drop', { bubbles: true, detail }));
      };
      if (!pointerType) { dispatch(); return; }
      // Consume the gesture's click before an app can replace this document.
      const controller = new AbortController();
      let timer, closed = false;
      const observer = new MutationObserver(() => { if (!board.isConnected) clear(); });
      const clear = () => {
        closed = true; clearTimeout(timer); controller.abort(); observer.disconnect(); queuedReview = null; suppressClick = false;
      };
      const deliver = () => { if (!closed) { clear(); dispatch(); } };
      queuedReview = clear;
      document.addEventListener('click', event => {
        if (event.pointerType && event.pointerType !== pointerType) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        queueMicrotask(deliver);
      }, { capture: true, signal: controller.signal });
      window.addEventListener('pagehide', clear, { signal: controller.signal });
      window.addEventListener('blur', clear, { signal: controller.signal });
      document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); }, { signal: controller.signal });
      observer.observe(document.body, { childList: true, subtree: true });
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
      removalObserver = new MutationObserver(() => { if (!board.isConnected) finish(); });
      removalObserver.observe(document.body, { childList: true, subtree: true });
    };
    const announce = text => { status.textContent = text; };
    const validCard = card => {
      if (!card?.dataset.key || !card.dataset.url) return false;
      try {
        const url = new URL(card.dataset.url, window.location.href);
        return ['http:', 'https:', 'file:'].includes(url.protocol) && url.origin === window.location.origin;
      } catch { return false; }
    };
    const reveal = cell => {
      if (!scroll || !cell) return;
      const box = scroll.getBoundingClientRect(), rect = cell.getBoundingClientRect();
      const left = box.left + board.querySelector('tbody th[scope="row"]').getBoundingClientRect().width;
      const top = box.top + board.querySelector('thead').getBoundingClientRect().height;
      if (rect.left < left) scroll.scrollLeft -= left - rect.left;
      else if (rect.right > box.right) scroll.scrollLeft += rect.right - box.right;
      if (rect.top < top) scroll.scrollTop -= top - rect.top;
      else if (rect.bottom > box.bottom) scroll.scrollTop += rect.bottom - box.bottom;
    };
    const choose = (cell, keyboard = false) => {
      if (target === cell) return;
      target?.classList.remove('is-target');
      target = cell;
      target?.classList.add('is-target');
      ghost?.classList.toggle('has-target', Boolean(cell));
      if (cell) {
        if (keyboard) reveal(cell);
        announce(`${board.dataset.target}: ${cell.dataset.laneLabel}, ${cell.dataset.dayLabel}.`);
      } else announce(board.dataset.invalid);
    };
    const finish = (review = false) => {
      const move = active, destination = target, pointer = pending;
      active = null;
      pending = null;
      cancelAnimationFrame(frame);
      previousTime = 0;
      ghost?.remove();
      ghost = null;
      session?.abort();
      session = null;
      removalObserver?.disconnect();
      removalObserver = null;
      document.documentElement.classList.remove('pt-schedule-dragging');
      target?.classList.remove('is-target');
      target = null;
      cancel.hidden = true;
      if (!move) {
        if (pointer?.captor.hasPointerCapture(pointer.id)) pointer.captor.releasePointerCapture(pointer.id);
        return;
      }
      move.handle.setAttribute('aria-pressed', 'false');
      move.card.classList.remove('is-picked-up');
      if (pointer?.captor.hasPointerCapture(pointer.id)) pointer.captor.releasePointerCapture(pointer.id);
      if (board.isConnected && !document.hidden) move.handle.focus({ preventScroll: true });
      announce(review && destination ? board.dataset.reviewing : board.dataset.cancelled);
      if (review && destination && validCard(move.card) && board.contains(move.card)) {
        emitReview({
          key: move.card.dataset.key, url: move.card.dataset.url,
          laneKey: destination.dataset.laneKey, dayKey: destination.dataset.dayKey,
        }, pointer?.pointerType);
      }
    };
    const start = (handle, pointerId = null) => {
      const card = handle.closest('[data-pt-schedule-card]');
      if (!cells.length || !validCard(card)) return false;
      if (active) finish();
      watchSession();
      active = { handle, card, pointerId };
      handle.setAttribute('aria-pressed', 'true');
      card.classList.add('is-picked-up');
      cancel.hidden = false;
      announce(`${board.dataset.pickedUp}: ${card.querySelector('strong').textContent}.`);
      if (pointerId === null) choose(card.closest('[data-pt-schedule-cell]') || cells[0], true);
      return true;
    };
    const hit = (x, y) => {
      const element = document.elementFromPoint(x, y);
      const cell = element?.closest('[data-pt-schedule-cell]');
      return cell && board.contains(cell) ? cell : null;
    };
    const createGhost = () => {
      const rect = active.card.getBoundingClientRect();
      ghost = document.createElement('div');
      ghost.className = 'pt-schedule-card pt-schedule-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      ghost.style.width = `${rect.width}px`;
      const title = document.createElement('strong');
      title.className = 'pt-schedule-card__title';
      title.textContent = active.card.querySelector('strong').textContent;
      ghost.append(title);
      const description = active.card.querySelector('.pt-schedule-card__description');
      if (description) {
        const text = document.createElement('span');
        text.className = description.className;
        text.textContent = description.textContent;
        ghost.append(text);
      }
      pending.offsetX = Math.min(rect.width, pending.startX - rect.left);
      pending.offsetY = Math.min(rect.height, pending.startY - rect.top);
      document.body.append(ghost);
      document.documentElement.classList.add('pt-schedule-dragging');
    };
    const tick = time => {
      if (!active || !pending || !scroll) return;
      const box = scroll.getBoundingClientRect();
      const { x, y } = pending;
      const cell = hit(x, y);
      const delta = scheduleScrollDelta(x, y, box, previousTime ? time - previousTime : 16);
      previousTime = time;
      // All geometry reads precede writes; pointermove only updates coordinates.
      choose(cell);
      scroll.scrollLeft += delta.x;
      scroll.scrollTop += delta.y;
      ghost.style.transform = `translate3d(${x - pending.offsetX}px, ${y - pending.offsetY}px, 0)`;
      frame = requestAnimationFrame(tick);
    };
    board.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || active || pending || queuedReview) return;
      const handle = event.target.closest('[data-pt-schedule-handle]');
      const card = event.target.closest('[data-pt-schedule-card]');
      const surface = board.dataset.dragSurface === 'card';
      // Touch keeps natural scrolling; surface mode opts text/edit links into mouse/pen dragging.
      if (!handle && (event.pointerType === 'touch' || !card ||
        event.target.closest('button, input, select, textarea, label, [contenteditable]') ||
        (!surface && event.target.closest('a, .pt-schedule-card__title, .pt-schedule-card__description')))) return;
      const keyboardHandle = handle || card.querySelector('[data-pt-schedule-handle]');
      if (!keyboardHandle || keyboardHandle.hidden || !validCard(card)) return;
      suppressClick = false;
      pending = { handle: keyboardHandle, captor: handle || event.target.closest('a') || card, id: event.pointerId, pointerType: event.pointerType,
        startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY };
      watchSession();
      pending.captor.setPointerCapture(event.pointerId);
    });
    board.addEventListener('pointermove', event => {
      if (!pending || pending.id !== event.pointerId) return;
      pending.x = event.clientX; pending.y = event.clientY;
      if (!active && Math.hypot(pending.x - pending.startX, pending.y - pending.startY) >= 8) {
        if (!start(pending.handle, event.pointerId)) { finish(); return; }
        pending.captor.setPointerCapture(event.pointerId);
        suppressClick = true;
        createGhost();
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
      if (!suppressClick || !event.target.closest('[data-pt-schedule-card]')) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    board.querySelectorAll('[data-pt-schedule-handle]').forEach((handle, index) => {
      handle.hidden = !cells.length;
      const description = handle.closest('[data-pt-schedule-card]').querySelector('[data-pt-schedule-description]');
      if (description) description.id = `${instructions.id}-card-${index}`;
      handle.setAttribute('aria-describedby', [instructions.id, description?.id].filter(Boolean).join(' '));
      handle.addEventListener('click', event => {
        event.preventDefault();
        if (suppressClick) { suppressClick = false; return; }
        if (!active) start(handle);
      });
      handle.addEventListener('keydown', event => {
        if (event.code === 'Space') { event.preventDefault(); if (!active) start(handle); return; }
        if (!active || active.handle !== handle || active.pointerId !== null) return;
        if (event.key === 'Enter') { event.preventDefault(); finish(true); return; }
        const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -board.querySelectorAll('thead [data-day-heading]').length,
          ArrowDown: board.querySelectorAll('thead [data-day-heading]').length };
        if (!(event.key in offsets)) return;
        event.preventDefault();
        const columns = board.querySelectorAll('thead [data-day-heading]').length;
        const index = cells.indexOf(target), offset = offsets[event.key];
        const next = index + offset;
        if (next < 0 || next >= cells.length) return;
        if (Math.abs(offset) === 1 && Math.floor(next / columns) !== Math.floor(index / columns)) return;
        choose(cells[next], true);
      });
    });
    cancel.addEventListener('click', () => finish());
    board.addEventListener('keydown', event => {
      if (event.key === 'Escape' && (active || pending)) { event.preventDefault(); finish(); }
      else if (event.key === 'Tab' && active) finish();
    });
    board.addEventListener('focusout', event => { if (active && !board.contains(event.relatedTarget)) finish(); });
    // The component accepts only its own pointer/keyboard session, never native or external data.
    board.addEventListener('dragstart', event => event.preventDefault());
    board.addEventListener('dragover', event => event.preventDefault());
    board.addEventListener('drop', event => { event.preventDefault(); finish(); });
  });
}
