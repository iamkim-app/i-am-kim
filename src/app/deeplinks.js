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
  const onVis = () => {
    if (document.hidden) didHide = true;
  };
  document.addEventListener("visibilitychange", onVis, { once: true });

  try {
    window.location.href = scheme;
  } catch {}

  setTimeout(() => {
    document.removeEventListener("visibilitychange", onVis);
    if (didHide) return;
    if (fallback) window.location.href = fallback;
  }, 1200);
}
