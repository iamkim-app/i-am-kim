export function safeOpen(urlScheme, androidUrl, iosUrl) {
  const scheme = String(urlScheme || "").trim();
  const android = String(androidUrl || "").trim();
  const ios = String(iosUrl || "").trim();
  if (!scheme && !android && !ios) return;

  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const fallback = (isIOS ? ios : android) || android || ios;

  if (!scheme) {
    if (fallback) window.location.href = fallback;
    return;
  }

  let didHide = false;
  let done = false;

  const finish = (navigateFallback) => {
    if (done) return;
    done = true;
    window.__safeOpenActive = false;
    document.removeEventListener("visibilitychange", onVis);
    if (navigateFallback && fallback) window.location.href = fallback;
  };

  const onVis = () => {
    if (document.hidden) {
      didHide = true;
    } else if (didHide) {
      finish(false);
    }
  };

  window.__safeOpenActive = true;
  document.addEventListener("visibilitychange", onVis);

  try {
    window.location.href = scheme;
  } catch {}

  setTimeout(() => {
    if (!didHide) finish(true);
  }, 1200);

  setTimeout(() => finish(false), 30000);
}
