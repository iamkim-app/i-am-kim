/**
 * app-lifecycle.js
 * Handles app foreground/background transitions for both native (Capacitor)
 * and WebView (Cordova resume event) contexts, and browser tab visibility changes.
 *
 * When the app returns to the foreground (isActive=true), the current page's
 * data is reloaded via window.IAMKIMBridge.resume(), which dispatches
 * the appropriate per-route refresh event.
 */

export async function initAppLifecycle() {
  // Capacitor App plugin — reliable on Android/iOS native builds
  try {
    const { App } = await import("@capacitor/app");

    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        window.IAMKIMBridge?.resume?.();
      }
    });
  } catch {
    // Not running inside Capacitor (plain web browser) — silently skip
  }

  // WebView / Cordova "resume" event — also fired by Capacitor's WebView layer
  // Acts as a secondary trigger so the two sources share the same debounced handler
  document.addEventListener("resume", () => {
    window.IAMKIMBridge?.resume?.();
  });

  // Browser tab visibility — handles switching back to this tab in a desktop/mobile browser
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      window.IAMKIMBridge?.resume?.();
    }
  });
}
