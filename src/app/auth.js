const getApp = () => window.App || {};
const getSupabase = () => getApp().supabase;

let AUTH_STATE = {
  isBanned: false,
  bannedUntil: null,
  session: null,
  banLoading: true,
};
let BAN_CHANNEL = null;
let AUTH_OAUTH_IN_PROGRESS = false;
let AUTH_SHEET_OPEN = false;

function formatBanMessage() {
  if (!AUTH_STATE.isBanned) return "";
  if (!AUTH_STATE.bannedUntil) return "Account suspended (permanent)";
  const d = new Date(AUTH_STATE.bannedUntil);
  if (!Number.isFinite(d.getTime())) return "Account suspended";
  return `Account suspended until ${d.toLocaleString()}`;
}

async function loadBanStatus() {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    const session = await getSession();
    if (!session) {
      AUTH_STATE.isBanned = false;
      AUTH_STATE.bannedUntil = null;
      AUTH_STATE.banLoading = false;
      updateBanUI();
      return;
    }
    const { data, error } = await supabase
      .from("user_bans")
      .select("banned_until,status")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status !== "active") {
      AUTH_STATE.isBanned = false;
      AUTH_STATE.bannedUntil = null;
    } else if (data.banned_until === null) {
      AUTH_STATE.isBanned = true;
      AUTH_STATE.bannedUntil = null;
    } else {
      const until = new Date(data.banned_until).getTime();
      AUTH_STATE.isBanned = Number.isFinite(until) && until > Date.now();
      AUTH_STATE.bannedUntil = data.banned_until;
    }
    AUTH_STATE.banLoading = false;
    updateBanUI();
  } catch (err) {
    console.warn("[auth] Ban check failed.", err);
    AUTH_STATE.banLoading = false;
    updateBanUI();
  }
}

function subscribeBanRealtime() {
  const supabase = getSupabase();
  if (!supabase) return;
  if (BAN_CHANNEL) return;
  const userId = AUTH_STATE.session?.user?.id;
  if (!userId) return;
  try {
    BAN_CHANNEL = supabase
      .channel(`realtime:user_bans:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_bans", filter: `user_id=eq.${userId}` },
        () => {
          loadBanStatus();
        }
      )
      .subscribe();
  } catch (err) {
    console.warn("[auth] Ban realtime subscribe failed.", err);
  }
}

function unsubscribeBanRealtime() {
  const supabase = getSupabase();
  if (!supabase || !BAN_CHANNEL) return;
  try {
    supabase.removeChannel(BAN_CHANNEL);
    BAN_CHANNEL = null;
  } catch (err) {
    console.warn("[auth] Ban realtime unsubscribe failed.", err);
  }
}

function updateBanUI() {
  const { $ } = getApp();
  const banner = $("#communityBanBanner");
  if (banner) {
    if (AUTH_STATE.isBanned) {
      banner.textContent = formatBanMessage();
      banner.style.display = "block";
    } else {
      banner.textContent = "";
      banner.style.display = "none";
    }
  }
  const profileNotice = $("#profileBanNotice");
  if (profileNotice) {
    if (AUTH_STATE.isBanned) {
      profileNotice.textContent = formatBanMessage();
      profileNotice.style.display = "block";
    } else {
      profileNotice.textContent = "";
      profileNotice.style.display = "none";
    }
  }
  const hint = $("#communityBanHint");
  if (hint) {
    if (AUTH_STATE.isBanned) {
      hint.textContent = "Posting is disabled while suspended.";
      hint.style.display = "inline-block";
    } else {
      hint.textContent = "";
      hint.style.display = "none";
    }
  }
  updateCommunityAuthControls();
}

function ensureAuthSheetUI() {
  const { $ } = getApp();
  if ($("#authSheet")) return;
  const el = document.createElement("div");
  el.className = "authSheet";
  el.id = "authSheet";
  el.hidden = true;
  el.innerHTML = `
    <div class="authSheet__backdrop" data-close="1"></div>
    <div class="authSheet__card" role="dialog" aria-modal="true" aria-label="Sign in">
      <div class="authSheet__head">
        <div class="authSheet__title">Sign in to continue</div>
        <button class="btn btn--ghost btn--small" data-close="1" type="button">Close</button>
      </div>
      <div class="authSheet__actions">
        <button class="btn btn--primary authSheet__btn" id="btnSheetGoogle" type="button">Continue with Google</button>
        <button class="btn btn--ghost authSheet__btn" id="btnSheetApple" type="button">Continue with Apple</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  el.addEventListener("click", (e) => {
    if (e.target?.closest?.("[data-close='1']")) {
      closeAuthSheet();
    }
  });

  $("#btnSheetGoogle")?.addEventListener("click", () => signInWith("google"));
  $("#btnSheetApple")?.addEventListener("click", () => signInWith("apple"));
}

function openAuthSheet() {
  ensureAuthSheetUI();
  const el = document.getElementById("authSheet");
  if (!el) return;
  AUTH_SHEET_OPEN = true;
  el.hidden = false;
  document.body.classList.add("is-sheet-open");
}

function closeAuthSheet() {
  const el = document.getElementById("authSheet");
  if (!el) return;
  AUTH_SHEET_OPEN = false;
  el.hidden = true;
  document.body.classList.remove("is-sheet-open");
}

async function processOAuthCallback() {
  const supabase = getSupabase();
  if (!supabase) return false;

  const hash = window.location.hash || "";
  const search = window.location.search || "";
  const params = new URLSearchParams(search);

  const hasAccessToken = hash.includes("access_token=") || hash.includes("refresh_token=");
  const code = params.get("code");

  if (!hasAccessToken && !code) return false;

  AUTH_OAUTH_IN_PROGRESS = true;

  try {
    // 1) PKCE/code flow ?�선 처리
    if (code && typeof supabase.auth.exchangeCodeForSession === "function") {
      await supabase.auth.exchangeCodeForSession(code);
    }

    // 2) Implicit flow (#access_token=...) fallback
    if (hasAccessToken) {
      const hp = new URLSearchParams(hash.replace(/^#/, ""));
      const access_token = hp.get("access_token") || "";
      const refresh_token = hp.get("refresh_token") || "";

      // supabase-js v2 계열: setSession 존재
      if (
        access_token &&
        refresh_token &&
        typeof supabase.auth.setSession === "function"
      ) {
        await supabase.auth.setSession({ access_token, refresh_token });
      }
    }
  } catch (err) {
    console.warn("[auth] OAuth callback handling failed.", err);
  } finally {
    AUTH_OAUTH_IN_PROGRESS = false;
  }

  // URL ?�리 (code/state ?�거 + hash ?�큰 ?�거)
  try {
    const cleanParams = new URLSearchParams(window.location.search || "");
    cleanParams.delete("code");
    cleanParams.delete("state");
    const qs = cleanParams.toString();
    const base = window.location.pathname || "/";
    history.replaceState({}, "", `${base}${qs ? `?${qs}` : ""}#home`);
  } catch {}

  return true;
}

async function getSession() {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

async function getAccessToken() {
  const session = await getSession();
  return session?.access_token || null;
}

function displayNameFromSession(session) {
  const md = session?.user?.user_metadata || {};
  const name =
    md.full_name ||
    md.name ||
    md.user_name ||
    md.preferred_username ||
    md.email ||
    session?.user?.email ||
    "Traveler";
  return String(name).trim() || "Traveler";
}

function avatarFromSession(session) {
  const md = session?.user?.user_metadata || {};
  return (md.avatar_url || md.picture || "").trim();
}

function updateAuthUI(session) {
  const { $, refreshQuotaPill } = getApp();
  AUTH_STATE.session = session || null;
  const btnG = $("#btnLoginGoogle");
  const btnA = $("#btnLoginApple");
  const btnOut = $("#btnLogout");

  const authed = !!session;

  if (btnG) btnG.style.display = authed ? "none" : "inline-flex";
  if (btnA) btnA.style.display = authed ? "none" : "inline-flex";
  if (btnOut) btnOut.style.display = authed ? "inline-flex" : "none";

  document.querySelectorAll('[data-auth-visible="signed-out"]').forEach((el) => {
    el.style.display = authed ? "none" : "";
  });
  document.querySelectorAll('[data-auth-visible="signed-in"]').forEach((el) => {
    el.style.display = authed ? "" : "none";
  });

  // Auth hints
  const watchHint = $("#watchAuthHint");
  const communityHint = $("#communityAuthHint");
  if (watchHint) watchHint.style.display = authed ? "none" : "block";
  if (communityHint) communityHint.style.display = authed ? "none" : "block";

  updateCommunityAuthControls(session);
  getApp().updateMobileAuthButton?.().catch?.(() => {});

  if (AUTH_SHEET_OPEN && session) {
    closeAuthSheet();
  }

  // refresh quota pill
  refreshQuotaPill?.().catch(() => {});
}

function updateCommunityAuthControls(session) {
  const { $ } = getApp();
  const authed = !!(session || AUTH_STATE.session);
  const btn = $("#btnNewPost");
  const fab = $("#fabNewPost");
  const disabled = !authed || AUTH_STATE.isBanned || AUTH_STATE.banLoading;
  if (btn) {
    btn.dataset.disabled = disabled ? "1" : "0";
    btn.classList.toggle("is-disabled", disabled);
    btn.style.opacity = disabled ? "0.5" : "";
  }
  if (fab) {
    fab.dataset.disabled = disabled ? "1" : "0";
    fab.classList.toggle("is-disabled", disabled);
    fab.style.opacity = disabled ? "0.5" : "";
  }
  const photo = $("#postPhoto");
  if (photo) photo.disabled = disabled;
}

async function signInWith(provider) {
  const supabase = getSupabase();
  const { toast } = getApp();
  if (!supabase) {
    toast?.("Supabase is not set. Add VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
    return;
  }
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
  if (error) toast?.(error.message);
}

async function signOut() {
  const supabase = getSupabase();
  const app = getApp();
  try {
    if (supabase) {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch (err) {
        const isLockError =
          err?.name === "NavigatorLockAcquireTimeoutError" ||
          String(err?.message || "").includes("NavigatorLockAcquireTimeoutError");
        if (isLockError) {
          try {
            const keys = Object.keys(localStorage || {});
            keys.forEach((key) => {
              if (key.startsWith("sb-") && key.includes("-auth-token")) {
                localStorage.removeItem(key);
              }
              if (key.startsWith("lock:sb-")) {
                localStorage.removeItem(key);
              }
            });
            const sKeys = Object.keys(sessionStorage || {});
            sKeys.forEach((key) => {
              if (key.startsWith("sb-") && key.includes("-auth-token")) {
                sessionStorage.removeItem(key);
              }
              if (key.startsWith("lock:sb-")) {
                sessionStorage.removeItem(key);
              }
            });
          } catch {}
          updateAuthUI(null);
          app.navigateToHome?.();
          return;
        }
        console.warn("[auth] Logout failed.", err);
      }
    }

    unsubscribeBanRealtime();
    app.clearAdminState?.("Not authorized.");
    // Immediate UI feedback
    if (app.PROFILE_STATE) {
      app.PROFILE_STATE.nickname = "";
      app.PROFILE_STATE.needsNickname = false;
    }
    app.setNicknameBannerVisible?.(false);
    app.loadAvatarFromLocalStorage?.();
    app.updateNicknameBadge?.();
    app.updateProfileUI?.();
    app.toast?.("Logged out");
    app.navigateToHome?.();
  } finally {
    try {
      window.dispatchEvent(new Event("auth:changed"));
    } catch {}
  }
}

async function handleAuthStateChange(event, session) {
  const app = getApp();
  updateAuthUI(session);
  try {
    window.dispatchEvent(new Event("auth:changed"));
  } catch {}

  if (AUTH_OAUTH_IN_PROGRESS && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
    return;
  }
  if (session) {
    app.syncFavoritesFromSupabase?.();
    app.syncCustomPhrasesFromSupabase?.();
    app.loadNicknameFromSupabase?.();
    loadBanStatus();
    AUTH_STATE.session = session;
    subscribeBanRealtime();
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL") {
      if (app.currentRoute?.() === "admin") {
        app.loadAdminPanel?.();
      }
    }
    return;
  }

  unsubscribeBanRealtime();
  if (app.PROFILE_STATE) {
    app.PROFILE_STATE.nickname = "";
    app.PROFILE_STATE.needsNickname = false;
  }
  app.setNicknameBannerVisible?.(false);
  app.loadAvatarFromLocalStorage?.();
  app.updateNicknameBadge?.();
  app.updateProfileUI?.();
  app.loadCustomPhrases?.();
  app.renderTravelPanel?.();
  AUTH_STATE.isBanned = false;
  AUTH_STATE.bannedUntil = null;
  updateBanUI();
  app.clearAdminState?.("Not authorized.");
  if (event === "SIGNED_OUT" && app.currentRoute?.() === "admin") {
    app.navigateToHome?.();
  }
}

function setupAuthButtons() {
  const { $ } = getApp();
  if (window.App) {
    window.App.openAuthSheet = openAuthSheet;
  }
  const btnG = $("#btnLoginGoogle");
  const btnA = $("#btnLoginApple");
  if (btnG) {
    btnG.setAttribute("data-auth-visible", "signed-out");
    btnG.addEventListener("click", () => signInWith("google"));
  }
  if (btnA) {
    btnA.setAttribute("data-auth-visible", "signed-out");
    btnA.addEventListener("click", () => signInWith("apple"));
  }
  const btnLogout = $("#btnLogout");
  if (btnLogout) {
    btnLogout.setAttribute("data-auth-action", "logout");
    btnLogout.setAttribute("data-auth-visible", "signed-in");
  }
  document.querySelectorAll('[data-auth-action="logout"]').forEach((el) => {
    if (el.dataset.logoutBound === "1") return;
    el.dataset.logoutBound = "1";
    el.addEventListener("click", signOut);
  });
  if (document.body?.dataset?.openAuthDelegated !== "1") {
    document.body.dataset.openAuthDelegated = "1";
    document.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("[data-auth-action=\"open-auth\"]");
      if (!btn) return;
      e.preventDefault();
      openAuthSheet();
    });
  }
  ensureAuthSheetUI();

  const supabase = getSupabase();
  if (!supabase) {
    updateAuthUI(null);
    return;
  }

  supabase.auth.getSession().then(({ data }) =>
    handleAuthStateChange("INITIAL", data.session)
  );
  supabase.auth.onAuthStateChange((event, session) => handleAuthStateChange(event, session));
}

export {
  AUTH_STATE,
  getSession,
  getAccessToken,
  displayNameFromSession,
  avatarFromSession,
  updateCommunityAuthControls,
  setupAuthButtons,
  processOAuthCallback,
  loadBanStatus,
  subscribeBanRealtime,
  unsubscribeBanRealtime,
  updateBanUI,
  signOut,
  ensureAuthSheetUI,
  openAuthSheet,
  closeAuthSheet,
};
