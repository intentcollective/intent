/* ==========================================================================
   Intent Collective: anchor links
   Keeps a linked section (for example index.html#manifesto or
   structure.html#fellowship) flush under the sticky header, even while the
   page is still changing height above it (the debate card and schedule
   load after the page appears, and the manifesto can open).

   For a few seconds after a link is followed, the target is re-aligned as
   the page settles. It stops at once if the visitor scrolls, touches or
   presses a key, so it never fights them.
   ========================================================================== */

(function () {
  const SETTLE_MS = 4000;
  const STEP_MS = 100;

  let timer = null;
  let cancelled = false;

  function target() {
    const id = decodeURIComponent(location.hash.slice(1));
    return id ? document.getElementById(id) : null;
  }

  function headerHeight() {
    const header = document.querySelector(".site-header");
    return header ? header.getBoundingClientRect().height : 0;
  }

  function align() {
    const el = target();
    if (!el) return;
    const delta = el.getBoundingClientRect().top - headerHeight();
    if (Math.abs(delta) > 1) {
      window.scrollTo({ top: window.scrollY + delta, behavior: "instant" });
    }
  }

  function settle() {
    clearInterval(timer);
    cancelled = false;
    const started = Date.now();
    align();
    timer = setInterval(() => {
      if (cancelled || Date.now() - started > SETTLE_MS) {
        clearInterval(timer);
        return;
      }
      align();
    }, STEP_MS);
  }

  function stop() { cancelled = true; }

  // The visitor takes over: stop re-aligning.
  ["wheel", "touchstart", "keydown"].forEach(type =>
    window.addEventListener(type, stop, { passive: true })
  );

  // A new link to a section on this page starts a new settle window.
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest("a[href]");
    if (!a) return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.hash && url.pathname === location.pathname) setTimeout(settle, 0);
  });

  window.addEventListener("hashchange", settle);
  window.addEventListener("load", () => { if (location.hash) settle(); });
  if (location.hash) settle();
})();
