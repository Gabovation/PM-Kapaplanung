// Board layout (UI Kit 1.33.0): loading and error state per widget frame, automatic retry of a
// failed widget, and Refresh reloads the frames instead of the whole board.
const LOAD_TIMEOUT_MS = 20000;
const RETRY_MS = 60000;

function setState(slot, state) {
  slot.querySelectorAll('[data-ops-board-state]').forEach((element) => { element.hidden = element.dataset.opsBoardState !== state; });
  slot.dataset.opsBoardStatus = state;
}

// A widget page extends ops_platform_ui/embed.html. Anything else in the frame - a proxy error page,
// a login page, a blocked frame - counts as error.
function isWidgetPage(frame) {
  try {
    const body = frame.contentDocument?.body;
    return Boolean(body && body.classList.contains('ops-embed'));
  } catch {
    return false;
  }
}

function watch(frame) {
  const slot = frame.closest('[data-ops-board-slot]');
  let timeout;
  let retry;
  const settle = () => {
    window.clearTimeout(timeout);
    const ok = isWidgetPage(frame);
    setState(slot, ok ? 'ready' : 'error');
    if (!ok) retry = window.setTimeout(load, RETRY_MS);
  };
  const load = () => {
    window.clearTimeout(retry);
    window.clearTimeout(timeout);
    setState(slot, 'loading');
    timeout = window.setTimeout(() => { setState(slot, 'error'); retry = window.setTimeout(load, RETRY_MS); }, LOAD_TIMEOUT_MS);
    frame.src = frame.getAttribute('src');
  };
  frame.addEventListener('load', settle);
  // The frame may have finished before this module ran.
  if (frame.contentDocument?.readyState === 'complete' && frame.contentWindow?.location.href !== 'about:blank') settle();
  else timeout = window.setTimeout(() => { setState(slot, 'error'); retry = window.setTimeout(load, RETRY_MS); }, LOAD_TIMEOUT_MS);
  return load;
}

const reloads = [...document.querySelectorAll('[data-ops-board] [data-ops-board-frame]')].map(watch);

document.addEventListener('ops:refresh', (event) => {
  if (!reloads.length) return;
  event.preventDefault();
  reloads.forEach((reload) => reload());
});
