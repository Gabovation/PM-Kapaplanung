/* Generic display connection lifecycle. The platform supplies URLs and authorization. */
(() => {
  'use strict';
  const meta = document.querySelector('meta[name="ops-display-connection"]');
  if (!meta) return;
  let config;
  try { config = JSON.parse(meta.content); } catch { return; }
  const status = document.querySelector('[data-ops-display-status]');
  const localURL = value => {
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin) throw new Error('Invalid display connection URL');
    return url.href;
  };
  let inFlight = false;
  let timer;
  let interrupted = false;
  const renew = async () => {
    if (inFlight) return;
    inFlight = true;
    clearTimeout(timer);
    let delay = 300000;
    try {
      const response = await fetch(localURL(config.renew_url), {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'X-Ops-Display': '1' }, signal: AbortSignal.timeout(15000)
      });
      if ([401, 403].includes(response.status)) {
        location.replace(localURL(config.registration_url));
        return;
      }
      if (!response.ok) throw new Error('Display connection unavailable');
      const result = await response.json();
      if (result.revision !== config.revision || interrupted || Date.now() >= config.expires_at_ms) {
        // Reload through the portal to recover expired sessions and fresh permissions.
        location.replace(localURL(config.resume_url));
        return;
      }
      config.expires_at_ms = result.expires_at_ms;
      if (status) status.hidden = true;
    } catch {
      interrupted = true;
      delay = 30000;
      if (status) { status.textContent = status.dataset.message; status.hidden = false; }
    } finally {
      inFlight = false;
      timer = setTimeout(renew, delay);
    }
  };
  window.addEventListener('online', renew);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renew(); });
  renew();
})();
