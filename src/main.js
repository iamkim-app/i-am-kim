import "./style.css";
import { createClient } from "@supabase/supabase-js";

/* -------------------------------------------------------------------------
   I AM KIM ??frontend (Vite)
   - Home: paste YouTube URL ??play ??extract travel-only info (Gemini backend)
   - Korea Now: static JSON categories (editable)
   - Community: Supabase posts + 1 photo upload (Storage)
---------------------------------------------------------------------------*/

/* ----------------------------- CONFIG ---------------------------------- */

const FEATURED_VIDEOS = [
  {
    title: "Seoul in a Day ??food + neighborhoods",
    url: "https://youtu.be/zKBczsHthLI?si=t1PjDgQFb13jJlDs",
    desc: "Fast, practical Seoul overview for first-timers.",
  },
  {
    title: "Korea travel tips ??what to know before you go",
    url: "https://youtu.be/V-4e-s0x2Ho?si=k7embO8GGfDI_Fmx",
    desc: "Transport, timing, common mistakes.",
  },
  {
    title: "Street food & markets ??where to go",
    url: "https://youtu.be/zKBczsHthLI?si=9bBQHmXlpA9JiDbO",
    desc: "Markets, food spots, and what to order.",
  },
];

const STORAGE_BACKEND_KEY = "iamkim_backend_origin_v1";
const STORAGE_QUOTA_REMAINING = "iamkim_quota_remaining_v1";
const PHRASE_STORAGE_KEY = "iamkim_phrase_favs_v1";
const PHRASE_FAVORITES_ONLY_KEY = "iamkim_phrase_favs_only_v1";
const PACKS_STORAGE_KEY = "iamkim_packs_v1";
const CUSTOM_PHRASES_KEY = "iamkim_custom_phrases";
const AVATAR_STORAGE_KEY = "iamkim_avatar";

const PHRASES = [];

/* ----------------------------- SUPABASE -------------------------------- */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage,
        },
      })
    : null;

let getSession;
let getAccessToken;
let processOAuthCallback;
let setupAuthButtons;
let signOut;
let ensureAuthSheetUI;
let openAuthSheet;
let loadBanStatus;
let subscribeBanRealtime;
let ensureCommentReportModal;
let setupCommunity;
let loadCommunityPosts;
let ensureAdminUI;
let loadAdminPanel;
let clearAdminState;
let clearAdminRefreshTimer;
let setupHome;
let youtubeIdFromUrl;
let normalizeYoutubeUrl;
let renderVideoPlayer;
let setWatchStatus;
let setText;
let setList;
let parseTimestampToSeconds;
let renderWatchMoments;
let setWatchInsights;
let analyzeHomeUrl;
let clearHome;
let renderFeaturedVideos;
let initKoreaNow;

/* ----------------------------- PROFILE / NICKNAME ---------------------- */

let PROFILE_STATE = {
  nickname: "",
  needsNickname: false,
  avatar: null,
};

function isValidNickname(name) {
  return /^[a-z0-9_\uac00-\ud7a3]{2,16}$/.test(name);
}

function defaultAvatar() {
  return { preset: "idol_stage_girl_01" };
}

function normalizeAvatar(avatar) {
  const a = avatar || {};
  const preset = String(a.preset || "idol_stage_girl_01");
  return { preset };
}

function loadAvatarFromLocalStorage() {
  try {
    const raw = localStorage.getItem(AVATAR_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    PROFILE_STATE.avatar = normalizeAvatar(parsed || defaultAvatar());
  } catch {
    PROFILE_STATE.avatar = defaultAvatar();
  }
}

function saveAvatarToLocalStorage(avatar) {
  localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(avatar));
}

function avatarPresets() {
  return [
    "idol_street_girl_01",
    "idol_stage_girl_01",
    "idol_airport_boy_01",
    "idol_stage_boy_01",
  ];
}

function avatarSrc(preset) {
  return `/avatars/${preset}.jpg`;
}

function ensureNicknameUI() {
  if ($("#nicknameBanner")) return;
  const banner = document.createElement("div");
  banner.className = "nickBanner";
  banner.id = "nicknameBanner";
  banner.hidden = true;
  banner.innerHTML = `
    <div class="nickBanner__inner">
      <div>
        <div class="nickBanner__title">Set your nickname</div>
        <div class="nickBanner__desc">Use 2??6 chars: Korean/letters/numbers/underscore.</div>
      </div>
      <div class="nickBanner__actions">
        <input id="nicknameInput" class="input" placeholder="nickname" autocomplete="off" />
        <button class="btn btn--ghost btn--small" id="btnCheckNick" type="button">Check</button>
        <button class="btn btn--primary btn--small" id="btnSaveNick" type="button">Save</button>
      </div>
      <div id="nicknameStatus" class="status" aria-live="polite"></div>
    </div>
  `;
  document.body.insertBefore(banner, document.body.firstChild);

  $("#btnCheckNick")?.addEventListener("click", () => checkNicknameAvailability());
  $("#btnSaveNick")?.addEventListener("click", () => saveNickname());
}

function setNicknameBannerVisible(show) {
  const banner = $("#nicknameBanner");
  if (!banner) return;
  banner.hidden = !show;
}
function ensureProfileUI() {
  const main = $(".main");
  if (!main || $("#page-profile")) return;
  const footer = main.querySelector(".footer");
  const section = document.createElement("section");
  section.className = "page";
  section.id = "page-profile";
  section.dataset.page = "profile";
  section.hidden = true;
  section.innerHTML = `
    <div class="pageHeader">
      <h2 class="pageHeader__title">Profile</h2>
      <p class="pageHeader__desc">Manage your identity and quick stats.</p>
    </div>

    <div class="profileWrap">
      <div class="callout" id="profileBanNotice" style="display:none"></div>
      <div class="profileCard profileCard--main">
        <div class="profileRow">
          <div>
            <div class="profileLabel">Nickname</div>
            <div class="profileValue" id="profileNickname">-</div>
            <div class="profileHint">This is shown publicly on community posts.</div>
          </div>
          <button class="btn btn--ghost btn--small" id="profileEditNick" type="button">Edit nickname</button>
        </div>
      </div>

      <div class="profileStatsGrid">
        <div class="profileStat">
          <div class="profileStat__label">Packs</div>
          <div class="profileStat__value" id="profilePackCount">0</div>
          <button class="profileStat__btn" id="profileManagePacks" type="button">Manage</button>
        </div>
        <div class="profileStat">
          <div class="profileStat__label">Favorites</div>
          <div class="profileStat__value" id="profileFavCount">0</div>
          <button class="profileStat__btn" id="profileViewFavorites" type="button">View favorites</button>
        </div>
        <div class="profileStat">
          <div class="profileStat__label">Custom phrases</div>
          <div class="profileStat__value" id="profileCustomCount">0</div>
          <button class="profileStat__btn" id="profileManageCustom" type="button">Manage</button>
        </div>
      </div>

      <div class="profileCard profileCard--avatar">
        <div class="profileAvatar">
          <div class="avatarPreview" id="avatarPreview"></div>
          <div class="avatarLabel">My KIM buddy</div>
        </div>
        <div class="avatarControls">
          <div class="avatarControl">
            <div class="avatarControl__label">Presets</div>
            <div class="avatarPresets" id="avatarPresets"></div>
          </div>
          <div class="avatarActions">
            <button class="btn btn--primary btn--small" id="avatarSave" type="button">Save</button>
          </div>
        </div>
      </div>

      <div class="profileActions">
        <button class="btn btn--ghost btn--small" id="profileContact" type="button">Contact us</button>
        <button class="btn btn--primary btn--small" type="button" data-auth-action="open-auth" data-auth-visible="signed-out">Sign in</button>
        <button class="btn btn--ghost btn--danger" id="profileLogout" type="button" data-auth-action="logout" data-auth-visible="signed-in">Logout</button>
      </div>
    </div>
  `;
  if (footer) {
    main.insertBefore(section, footer);
  } else {
    main.appendChild(section);
  }

  $("#profileContact")?.addEventListener("click", () => openContactModal());
  $("#profileEditNick")?.addEventListener("click", () => {
    setNicknameBannerVisible(true);
    const input = $("#nicknameInput");
    if (input) input.focus();
  });
  $("#avatarSave")?.addEventListener("click", () => saveAvatar());
  $("#profileManagePacks")?.addEventListener("click", () => {
    location.hash = "#phrases";
    const el = $("#packsArea");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#profileViewFavorites")?.addEventListener("click", () => {
    PHRASE_STATE.favoritesOnly = true;
    saveFavoritesOnly();
    location.hash = "#phrases";
    const favToggle = $("#phraseFavToggle");
    if (favToggle) {
      favToggle.setAttribute("aria-pressed", "true");
      favToggle.classList.add("is-active");
    }
    renderPhraseList();
  });
  $("#profileManageCustom")?.addEventListener("click", () => {
    location.hash = "#phrases";
    if (!PACK_STATE.selectedPackId && PACK_STATE.packs.length) {
      PACK_STATE.selectedPackId = PACK_STATE.packs[0].id;
    }
    PACK_STATE.category = "Custom";
    renderPacksUI();
    const el = $("#packsArea");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function updateProfileUI() {
  const nicknameEl = $("#profileNickname");
  if (nicknameEl) nicknameEl.textContent = PROFILE_STATE.nickname || "-";

  const packEl = $("#profilePackCount");
  if (packEl) packEl.textContent = String(PACK_STATE.packs.length);

  const favEl = $("#profileFavCount");
  if (favEl) favEl.textContent = String(PHRASE_STATE.favorites.size);

  const customEl = $("#profileCustomCount");
  if (customEl) customEl.textContent = String(CUSTOM_STATE.phrases.length);

  updateAvatarUI();
}

function updateAvatarUI() {
  const preview = $("#avatarPreview");
  if (preview) {
    const preset = normalizeAvatar(PROFILE_STATE.avatar || defaultAvatar()).preset;
    preview.innerHTML = `<img src="${avatarSrc(preset)}" alt="Avatar preview" />`;
  }

  const badge = $("#nicknameBadge");
  const badgeAvatar = $("#nicknameBadgeAvatar");
  if (badge && badgeAvatar) {
    const preset = normalizeAvatar(PROFILE_STATE.avatar || defaultAvatar()).preset;
    badgeAvatar.innerHTML = `<img src="${avatarSrc(preset)}" alt="" />`;
  }

  const mobileAuth = $("#btnMobileAuth");
  if (mobileAuth && mobileAuth.dataset.authed === "1") {
    const preset = normalizeAvatar(PROFILE_STATE.avatar || defaultAvatar()).preset;
    const hasAvatar = !!preset;
    mobileAuth.dataset.avatar = hasAvatar ? "1" : "0";
    if (hasAvatar) {
      mobileAuth.innerHTML = `<img class="mobileTopbar__avatar" src="${avatarSrc(preset)}" alt="Profile" />`;
    }
  }

  const host = $("#avatarPresets");
  if (!host) return;
  const current = normalizeAvatar(PROFILE_STATE.avatar || defaultAvatar()).preset;
  host.innerHTML = avatarPresets()
    .map((preset) => {
      const active = preset === current;
      return `
        <button class="avatarPreset ${active ? "is-active" : ""}" data-preset="${preset}" type="button">
          <img src="${avatarSrc(preset)}" alt="${preset}" />
        </button>
      `;
    })
    .join("");
}

function bindAvatarControls() {
  const wrap = $(".profileCard--avatar");
  if (!wrap) return;
  wrap.addEventListener("click", (e) => {
    const presetBtn = e.target?.closest?.(".avatarPreset");
    if (presetBtn) {
      const preset = presetBtn.dataset.preset || "idol_girl_01";
      PROFILE_STATE.avatar = normalizeAvatar({ preset });
      updateAvatarUI();
      return;
    }
  });
}

async function saveAvatar() {
  const avatar = normalizeAvatar(PROFILE_STATE.avatar || defaultAvatar());
  PROFILE_STATE.avatar = avatar;
  saveAvatarToLocalStorage(avatar);
  toast("Saved");

  if (!supabase) return;
  try {
    const session = await getSession();
    if (!session) return;
    const { error } = await supabase
      .from("profiles")
      .upsert({ user_id: session.user.id, avatar });
    if (error) throw error;
  } catch (err) {
    console.warn("[avatar] Failed to save to Supabase.", err);
  }
}

function refreshProfileStateFromStorage() {
  loadPacks();
  loadCustomPhrases();
  loadPhraseFavorites();
  updateProfileUI();
}

function ensureNicknameBadge() {
  const host = $(".topbar__actions");
  if (!host || $("#nicknameBadge")) return;
  const btn = document.createElement("button");
  btn.className = "nickBadge";
  btn.id = "nicknameBadge";
  btn.type = "button";
  btn.innerHTML = `<span class="nickBadge__avatar" id="nicknameBadgeAvatar"></span><span class="nickBadge__text"></span>`;
  btn.addEventListener("click", () => {
    location.hash = "#profile";
  });
  host.insertBefore(btn, host.firstChild);
}

/* ----------------------------- MOBILE TOPBAR --------------------------- */

function mobileIconSvg(kind) {
  const attrs = 'class="mobileIcon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
  if (kind === "menu") {
    return `<svg ${attrs}><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  }
  if (kind === "search") {
    return `<svg ${attrs}><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M16.5 16.5l3.5 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  }
  return `<svg ${attrs}><path d="M12 12a4 4 0 1 0-0.001-8.001A4 4 0 0 0 12 12z" stroke="currentColor" stroke-width="2" fill="none"/><path d="M4 20c1.8-3.3 5-5 8-5s6.2 1.7 8 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
}

function ensureMobileTopbar() {
  const topbar = $(".topbar");
  if (!topbar || $("#mobileTopbar")) return;

  const bar = document.createElement("div");
  bar.className = "mobileTopbar";
  bar.id = "mobileTopbar";
    bar.innerHTML = `
    <button class="mobileTopbar__btn mobileTopbar__iconBtn" id="btnMobileMenu" type="button" aria-label="Menu">${mobileIconSvg("menu")}</button>
    <button class="mobileTopbar__brand" id="mobileLogo" type="button" aria-label="I AM KIM">
      <span class="mobileTopbar__mark brand__mark" aria-hidden="true"></span>
      <span class="mobileTopbar__wordmark">I AM KIM</span>
    </button>
    <div class="mobileTopbar__actions">
      <button class="mobileTopbar__btn mobileTopbar__iconBtn mobileTopbar__auth" id="btnMobileAuth" type="button" aria-label="Login">${mobileIconSvg("user")}</button>
    </div>
  `;
  topbar.appendChild(bar);

  $("#mobileLogo")?.addEventListener("click", () => navigateToHome());
  $("#btnMobileMenu")?.addEventListener("click", () => {
    openMobileMenuSheet();
  });
}


function ensureMobileMenuSheet() {
  if ($("#mobileMenuSheet")) return;
  const sheet = document.createElement("div");
  sheet.className = "menuSheet";
  sheet.id = "mobileMenuSheet";
  sheet.hidden = true;
  sheet.innerHTML = `
    <div class="menuSheet__backdrop" data-close="1"></div>
    <div class="menuSheet__card" role="dialog" aria-modal="true" aria-label="Menu">
      <div class="menuSheet__head">
        <div class="menuSheet__title">Menu</div>
        <button class="btn btn--ghost btn--small" data-close="1" type="button">Close</button>
      </div>
      <div class="menuSheet__links">
        <button class="menuSheet__link" type="button" data-route="home">Home</button>
        <button class="menuSheet__link" type="button" data-route="community">Community</button>
        <button class="menuSheet__link" type="button" data-route="profile">Profile</button>
      </div>
    </div>
  `;
  document.body.appendChild(sheet);

  sheet.addEventListener("click", (e) => {
    if (e.target?.closest?.("[data-close='1']")) {
      closeMobileMenuSheet();
    }
    const link = e.target?.closest?.(".menuSheet__link");
    if (link) {
      const route = link.dataset.route || "home";
      location.hash = `#${route}`;
      closeMobileMenuSheet();
    }
  });
}

function ensureEmergencySheet() {
  if ($("#emergencySheet")) return;
  const sheet = document.createElement("div");
  sheet.className = "menuSheet emergencySheet";
  sheet.id = "emergencySheet";
  sheet.hidden = true;
  sheet.innerHTML = `
    <div class="menuSheet__backdrop" data-close="1"></div>
    <div class="menuSheet__card" role="dialog" aria-modal="true" aria-label="Emergency">
      <div class="menuSheet__head">
        <div class="menuSheet__title">Emergency</div>
        <button class="btn btn--ghost btn--small" data-close="1" type="button">Close</button>
      </div>
      <div class="menuSheet__links">
        <a class="menuSheet__link" href="tel:112">112 Police</a>
        <a class="menuSheet__link" href="tel:119">119 Fire / Ambulance</a>
        <a class="menuSheet__link" href="tel:1330">1330 Korea Travel Hotline</a>
      </div>
    </div>
  `;
  document.body.appendChild(sheet);

  sheet.addEventListener("click", (e) => {
    if (e.target?.closest?.("[data-close='1']")) {
      closeEmergencySheet();
    }
  });
}

function openEmergencySheet() {
  ensureEmergencySheet();
  const sheet = $("#emergencySheet");
  if (!sheet) return;
  sheet.hidden = false;
  if (document?.body) document.body.classList.add("is-sheet-open");
}

function closeEmergencySheet() {
  const sheet = $("#emergencySheet");
  if (!sheet) return;
  sheet.hidden = true;
  if (document?.body) document.body.classList.remove("is-sheet-open");
}

function openMobileMenuSheet() {
  ensureMobileMenuSheet();
  const sheet = $("#mobileMenuSheet");
  if (!sheet) return;
  sheet.hidden = false;
  document.body.classList.add("is-sheet-open");
}

function closeMobileMenuSheet() {
  const sheet = $("#mobileMenuSheet");
  if (!sheet) return;
  sheet.hidden = true;
  document.body.classList.remove("is-sheet-open");
}

async function updateMobileAuthButton() {
  try {
    const btn = $("#btnMobileAuth");
    if (!btn) return;

    let authed = false;
    try {
      if (typeof getSession === "function") {
        const session = await getSession();
        authed = !!session;
      }
    } catch {}

    const label = authed ? "Profile" : "Login";
    try {
      btn.setAttribute("aria-label", label);
    } catch {}
    try {
      btn.dataset.authed = authed ? "1" : "0";
    } catch {}

    try {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);

      const fallbackIcon = mobileIconSvg("user");

      if (!authed) {
        newBtn.dataset.avatar = "0";
        newBtn.innerHTML = fallbackIcon;
      } else {
        let preset = "";
        try {
          const stored = localStorage.getItem(AVATAR_STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            preset = normalizeAvatar(parsed || defaultAvatar()).preset || "";
          }
        } catch {}

        if (!preset) {
          try {
            preset = normalizeAvatar(PROFILE_STATE.avatar || defaultAvatar()).preset || "";
          } catch {}
        }

        if (preset) {
          newBtn.dataset.avatar = "1";
          newBtn.innerHTML = `<img class="mobileTopbar__avatar" src="${avatarSrc(preset)}" alt="Profile" />`;
        } else {
          newBtn.dataset.avatar = "0";
          newBtn.innerHTML = fallbackIcon;
        }
      }

      newBtn.onclick = () => {
        if (newBtn.dataset.authed === "1") {
          location.hash = "#profile";
          return;
        }
        window.App?.openAuthSheet?.();
      };
    } catch {}
  } catch {}
}

function bindMobileAuthButton() {
  if (bindMobileAuthButton.bound) return;
  bindMobileAuthButton.bound = true;

  document.addEventListener("click", async (e) => {
    // 1) Robustly locate #btnMobileAuth even when click target is SVG/path
    let btn = null;

    try {
      if (typeof e.composedPath === "function") {
        const path = e.composedPath();
        btn = path.find((n) => n && n.id === "btnMobileAuth") || null;
      }

      if (!btn) {
        let n = e.target;
        while (n && n !== document) {
          if (n.id === "btnMobileAuth") {
            btn = n;
            break;
          }
          n = n.parentNode;
        }
      }
    } catch {
      btn = null;
    }

    if (!btn) return;

    // 2) Decide action
    let session = null;
    try {
      if (typeof window.App?.getSession === "function") session = await window.App.getSession();
      else if (typeof getSession === "function") session = await getSession();
    } catch {
      session = null;
    }

    if (session) {
      location.hash = "#profile";
      return;
    }

    // Signed-out UX: open auth sheet if available; otherwise go profile page (which has Sign in)
    if (typeof window.App?.openAuthSheet === "function") window.App.openAuthSheet();
    else location.hash = "#profile";
  });
}

function updateNicknameBadge() {
  const badge = $("#nicknameBadge");
  if (!badge) return;
  if (PROFILE_STATE.nickname) {
    const text = badge.querySelector(".nickBadge__text");
    if (text) text.textContent = `Hi, ${PROFILE_STATE.nickname}`;
    badge.style.display = "inline-flex";
  } else {
    const text = badge.querySelector(".nickBadge__text");
    if (text) text.textContent = "";
    badge.style.display = "none";
  }
}

async function loadNicknameFromSupabase() {
  if (!supabase) return;
  try {
    const session = await getSession();
    if (!session) {
      PROFILE_STATE.nickname = "";
      PROFILE_STATE.needsNickname = false;
      setNicknameBannerVisible(false);
      loadAvatarFromLocalStorage();
      updateAvatarUI();
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("nickname, avatar")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) throw error;

    const nick = String(data?.nickname || "").trim().toLowerCase();
    PROFILE_STATE.nickname = nick;
    PROFILE_STATE.needsNickname = !nick;
    PROFILE_STATE.avatar = normalizeAvatar(data?.avatar || defaultAvatar());
    setNicknameBannerVisible(PROFILE_STATE.needsNickname);
    updateNicknameBadge();
    updateProfileUI();
  } catch (err) {
    console.warn("[nickname] Failed to load nickname.", err);
  }
}

async function checkNicknameAvailability() {
  const status = $("#nicknameStatus");
  if (!supabase) {
    if (status) status.textContent = "Supabase is not configured.";
    return;
  }
  const input = $("#nicknameInput");
  const raw = String(input?.value || "").trim().toLowerCase();
  if (!isValidNickname(raw)) {
    if (status) status.textContent = "Use 2-16 chars: letters, numbers, underscore, or Korean.";
    return;
  }
  try {
    if (status) status.textContent = "Checking...";
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("nickname", raw)
      .limit(1);
    if (error) throw error;
    const taken = Array.isArray(data) && data.length > 0;
    if (status) status.textContent = taken ? "Taken." : "Available.";
  } catch (err) {
    console.warn("[nickname] Check failed.", err);
    if (status) status.textContent = "Check failed. Try again.";
  }
}

async function saveNickname() {
  const status = $("#nicknameStatus");
  if (!supabase) {
    if (status) status.textContent = "Supabase is not configured.";
    return;
  }
  const input = $("#nicknameInput");
  const raw = String(input?.value || "").trim().toLowerCase();
  if (!isValidNickname(raw)) {
    if (status) status.textContent = "Use 2-16 chars: letters, numbers, underscore, or Korean.";
    return;
  }
  try {
    const session = await getSession();
    if (!session) {
      if (status) status.textContent = "Please sign in first.";
      return;
    }
    if (status) status.textContent = "Saving...";
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("nickname", raw)
      .limit(1);
    if (error) throw error;
    const taken = Array.isArray(data) && data.length > 0 && data[0].user_id !== session.user.id;
    if (taken) {
      if (status) status.textContent = "Taken.";
      return;
    }
    const payload = { user_id: session.user.id, nickname: raw };
    const { error: upsertErr } = await supabase.from("profiles").upsert(payload);
    if (upsertErr) throw upsertErr;
    PROFILE_STATE.nickname = raw;
    PROFILE_STATE.needsNickname = false;
    setNicknameBannerVisible(false);
    updateNicknameBadge();
    updateProfileUI();
    if (status) status.textContent = "Saved.";
  } catch (err) {
    console.warn("[nickname] Save failed.", err);
    if (status) status.textContent = "Save failed. Try again.";
  }
}

/* ----------------------------- DOM HELPERS ----------------------------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function truncateText(text, maxLen) {
  const raw = String(text || "");
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen).trim()}...`;
}

/* ----------------------------- TOAST ----------------------------------- */

let toastTimer = null;

function toast(msg) {
  const text = String(msg || "").trim();
  if (!text) return;

  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add("toast--show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("toast--show"), 2600);
}

/* ----------------------------- CONTACT MODAL ---------------------------- */

let CONTACT_OPEN = false;

function ensureContactModal() {
  if ($("#contactModal")) return;
  const el = document.createElement("div");
  el.className = "modal";
  el.id = "contactModal";
  el.hidden = true;
  el.innerHTML = `
    <div class="modal__backdrop" data-close="1"></div>
    <div class="modal__card">
      <div class="modal__head">
        <div class="modal__title">Contact us</div>
        <button class="btn btn--ghost btn--small" data-close="1" type="button">Close</button>
      </div>
      <div class="muted small">We usually reply within 1-2 business days.</div>
      <div class="card card--inner" style="margin-top:10px;">
        <div class="label">Email</div>
        <a class="btn btn--ghost btn--small" href="mailto:kstudyaiworld@gmail.com">kstudyaiworld@gmail.com</a>
      </div>
      <div class="row" style="justify-content:flex-end; margin-top:10px;">
        <button class="btn btn--primary btn--small" data-close="1" type="button">Done</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  el.addEventListener("click", (e) => {
    if (e.target?.closest?.("[data-close='1']")) {
      closeContactModal();
    }
  });
}

function openContactModal() {
  ensureContactModal();
  const modal = $("#contactModal");
  if (!modal || CONTACT_OPEN) return;
  CONTACT_OPEN = true;
  modal.hidden = false;
}

function closeContactModal() {
  const modal = $("#contactModal");
  if (modal) modal.hidden = true;
  CONTACT_OPEN = false;
}

/* ----------------------------- ROUTING --------------------------------- */

const ROUTE_ALIASES = {
  now: "mykorea",
  "korea-now": "mykorea",
};

const ROUTE_PAGE_MAP = {
  mykorea: "korea-now",
};

function normalizeRoute(route) {
  const key = (route || "").toLowerCase();
  return ROUTE_ALIASES[key] || key || "home";
}

function updateBottomTabbarRoutes() {
  const mappings = [
    { from: "home", to: { route: "home", href: "#home", label: "Home" } },
    { from: "kpop", to: { route: "kpop", href: "#kpop", label: "Kpop" } },
    { from: "mykorea", to: { route: "mykorea", href: "#mykorea", label: "MyKorea" } },
    { from: "community", to: { route: "community", href: "#community", label: "Community" } },
    { from: "info", to: { route: "info", href: "#info", label: "Information" } },
  ];

  mappings.forEach(({ from, to }) => {
    const link = document.querySelector(`.tabbar__link[data-route="${from}"]`);
    if (!link) return;
    link.dataset.route = to.route;
    link.setAttribute("href", to.href);
    const label = link.querySelector(".tabbar__label");
    if (label) label.textContent = to.label;
  });
}

function currentRoute() {
  const path = (location.pathname || "").toLowerCase();
  if (path.endsWith("/admin")) return "admin";
  const raw = (location.hash || "#home").replace("#", "").trim();
  return normalizeRoute(raw);
}

function navigateToHome() {
  const path = (location.pathname || "").toLowerCase();
  if (path.endsWith("/admin")) {
    history.replaceState({}, "", "/");
  }
  location.hash = "#home";
  setActiveRoute("home");
}

function setActiveRoute(route) {
  const pageRoute = ROUTE_PAGE_MAP[route] || route;
  // pages
  $$(".page").forEach((p) => {
    p.hidden = p.dataset.page !== pageRoute;
  });

  // desktop nav
  $$(".nav__link").forEach((a) => {
    a.classList.toggle(
      "is-active",
      a.dataset.route === route || a.dataset.route === pageRoute
    );
  });

  // mobile tab bar
  $$(".tabbar__link").forEach((a) => {
    a.classList.toggle(
      "is-active",
      a.dataset.route === route || a.dataset.route === pageRoute
    );
  });

  // route hooks
  if (route === "mykorea") initKoreaNow?.({ mode: "mykorea" });
  if (route === "kpop") initKoreaNow?.({ mode: "kpop" });
  if (pageRoute === "community") loadCommunityPosts?.(false);
  if (pageRoute === "admin") loadAdminPanel?.();
  if (pageRoute !== "admin") clearAdminRefreshTimer?.();
  if (pageRoute === "profile") refreshProfileStateFromStorage();
}

/* ----------------------------- ENV / BACKEND --------------------------- */

function isNativeShell() {
  return location.protocol === "capacitor:" || location.protocol === "file:";
}

function getBackendOrigin() {
  if (!isNativeShell()) return ""; // web: same origin
  const saved = localStorage.getItem(STORAGE_BACKEND_KEY);
  return (saved || "").trim();
}

function apiUrl(path) {
  const origin = getBackendOrigin();
  return origin ? `${origin}${path}` : path;
}

/* ----------------------------- QUOTA PILL ------------------------------ */

function setQuotaPillText(text) {
  const pill = $("#watchQuotaPill");
  if (!pill) return;

  const t = String(text || "").trim();
  if (!t) {
    pill.style.display = "none";
    pill.textContent = "";
    return;
  }
  pill.style.display = "inline-flex";
  pill.textContent = t;
}

async function refreshQuotaPill() {
  // 1) If we have a saved "remaining" from the last analyze call, use it instantly.
  const saved = localStorage.getItem(STORAGE_QUOTA_REMAINING);
  if (saved && /^\d+$/.test(saved)) {
    setQuotaPillText(`${saved} free left`);
  }

  // 2) If authenticated and the Supabase SQL is installed, ask Supabase for status.
  if (!supabase) return;

  const session = await getSession();
  if (!session) {
    setQuotaPillText("");
    return;
  }

  const { data, error } = await supabase.rpc("get_quota_status", { free_limit: 3 });
  if (error) return; // SQL not installed yet

  const row = Array.isArray(data) ? data[0] : data;
  const remaining = Number(row?.remaining);
  if (Number.isFinite(remaining)) {
    localStorage.setItem(STORAGE_QUOTA_REMAINING, String(Math.max(0, remaining)));
    setQuotaPillText(`${Math.max(0, remaining)} free left`);
  }
}



/* ----------------------------- PHRASES -------------------------------- */

let PHRASE_STATE = {
  query: "",
  category: "All",
  favorites: new Set(),
  selectedId: null,
  favoritesOnly: false,
  phrases: [],
  loading: false,
  loadError: false,
};

let PACK_STATE = {
  packs: [],
  selectedPackId: "",
  query: "",
  category: "All",
};

let CUSTOM_STATE = {
  phrases: [],
};

function normalizePhraseId(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    if (/^custom_/i.test(t)) return t;
    if (/^\d+$/.test(t)) return Number(t);
    return t;
  }
  return null;
}

function loadCustomPhrases() {
  try {
    const raw = localStorage.getItem(CUSTOM_PHRASES_KEY);
    const arr = JSON.parse(raw || "[]");
    if (Array.isArray(arr)) {
      CUSTOM_STATE.phrases = arr
        .map((p) => ({
          id: String(p?.id || ""),
          category: "Custom",
          en: String(p?.en || ""),
          ko: String(p?.ko || ""),
          romanization: String(p?.romanization || ""),
          createdAt: Number(p?.createdAt) || Date.now(),
        }))
        .filter((p) => p.id && p.en && p.ko);
    }
  } catch {}
  updateProfileUI();
}

function saveCustomPhrases() {
  localStorage.setItem(CUSTOM_PHRASES_KEY, JSON.stringify(CUSTOM_STATE.phrases));
  updateProfileUI();
}

function getAllPhrases() {
  return [...PHRASE_STATE.phrases, ...CUSTOM_STATE.phrases];
}

function deleteCustomPhrase(id) {
  const key = normalizePhraseId(id);
  if (!key || typeof key !== "string" || !key.startsWith("custom_")) return;

  // Remove from custom list
  const before = CUSTOM_STATE.phrases.length;
  CUSTOM_STATE.phrases = CUSTOM_STATE.phrases.filter((p) => p.id !== key);
  if (CUSTOM_STATE.phrases.length !== before) saveCustomPhrases();

  // Remove from packs
  let packsChanged = false;
  PACK_STATE.packs.forEach((p) => {
    const prev = p.phraseIds.length;
    p.phraseIds = p.phraseIds.filter((pid) => pid !== key);
    if (p.phraseIds.length !== prev) packsChanged = true;
  });
  if (packsChanged) savePacks();

  // Remove from favorites if present
  if (PHRASE_STATE.favorites.has(key)) {
    PHRASE_STATE.favorites.delete(key);
    savePhraseFavorites();
  }

  deleteCustomPhraseFromSupabase(key);
  updateProfileUI();
}

function isSpamOrProfanity(text) {
  const t = String(text || "").toLowerCase();
  if (/(http|https|www\.|\.com|\.net|\.org)/i.test(t)) return true;
  const bad = ["fuck", "shit", "bitch", "asshole", "bastard", "nigger", "cunt"];
  return bad.some((w) => t.includes(w));
}

function validateCustomPhrase(en, ko, romanization) {
  const e = String(en || "").trim();
  const k = String(ko || "").trim();
  const r = String(romanization || "").trim();
  if (e.length < 3 || e.length > 80) return { ok: false, reason: "length" };
  if (k.length < 1 || k.length > 80) return { ok: false, reason: "length" };
  if (r.length > 80) return { ok: false, reason: "length" };
  if (isSpamOrProfanity(e) || isSpamOrProfanity(k) || isSpamOrProfanity(r)) {
    return { ok: false, reason: "spam" };
  }
  return { ok: true };
}

function mergeCustomPhrases(localList, serverList) {
  const map = new Map();
  (localList || []).forEach((p) => {
    if (!p?.id) return;
    map.set(p.id, p);
  });
  (serverList || []).forEach((p) => {
    if (!p?.id) return;
    const hasText = String(p.en || "").trim() && String(p.ko || "").trim();
    if (hasText) {
      map.set(p.id, p);
    }
  });
  return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function syncCustomPhrasesFromSupabase() {
  if (!supabase) return;
  try {
    const session = await getSession();
    if (!session) return;
    const { data, error } = await supabase
      .from("custom_phrases")
      .select("id,en,ko,romanization,created_at")
      .eq("user_id", session.user.id);
    if (error) throw error;

    const serverList = (data || [])
      .map((p) => ({
        id: String(p?.id || ""),
        category: "Custom",
        en: String(p?.en || ""),
        ko: String(p?.ko || ""),
        romanization: String(p?.romanization || ""),
        createdAt: new Date(p?.created_at || Date.now()).getTime(),
      }))
      .filter((p) => p.id && p.en && p.ko);

    CUSTOM_STATE.phrases = serverList;
    saveCustomPhrases();
    renderPacksUI();
    renderTravelPanel();
    updateProfileUI();
  } catch (err) {
    console.warn("[custom_phrases] Failed to sync from Supabase.", err);
  }
}

async function upsertCustomPhraseToSupabase(entry) {
  if (!supabase) return;
  try {
    const session = await getSession();
    if (!session) return;
    const payload = {
      id: entry.id,
      user_id: session.user.id,
      en: entry.en,
      ko: entry.ko,
      romanization: entry.romanization || null,
    };
    const { error } = await supabase.from("custom_phrases").upsert(payload);
    if (error) throw error;
  } catch (err) {
    console.warn("[custom_phrases] Failed to upsert.", err);
  }
}

async function deleteCustomPhraseFromSupabase(id) {
  if (!supabase) return;
  try {
    const session = await getSession();
    if (!session) return;
    const { error } = await supabase
      .from("custom_phrases")
      .delete()
      .eq("user_id", session.user.id)
      .eq("id", id);
    if (error) throw error;
  } catch (err) {
    console.warn("[custom_phrases] Failed to delete.", err);
  }
}

function loadPacks() {
  try {
    const raw = localStorage.getItem(PACKS_STORAGE_KEY);
    const arr = JSON.parse(raw || "[]");
    if (Array.isArray(arr)) {
      PACK_STATE.packs = arr
        .filter((p) => p && p.id && p.name)
        .map((p) => ({
          id: String(p.id),
          name: String(p.name),
          phraseIds: Array.isArray(p.phraseIds)
            ? p.phraseIds
                .map((v) => normalizePhraseId(v))
                .filter((v) => v !== null)
            : [],
          createdAt: Number(p.createdAt) || Date.now(),
        }));
    }
  } catch {}
}

function savePacks() {
  localStorage.setItem(PACKS_STORAGE_KEY, JSON.stringify(PACK_STATE.packs));
  updateProfileUI();
}

function createPack(name) {
  const n = String(name || "").trim();
  if (!n) return null;
  const id = `pack_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const pack = { id, name: n, phraseIds: [], createdAt: Date.now() };
  PACK_STATE.packs.unshift(pack);
  savePacks();
  renderTravelPanel();
  return pack;
}

function deletePack(id) {
  const before = PACK_STATE.packs.length;
  PACK_STATE.packs = PACK_STATE.packs.filter((p) => p.id !== id);
  if (PACK_STATE.selectedPackId === id) {
    PACK_STATE.selectedPackId = "";
  }
  if (PACK_STATE.packs.length !== before) savePacks();
  renderTravelPanel();
}

function getPackById(id) {
  return PACK_STATE.packs.find((p) => p.id === id) || null;
}

function togglePhraseInPack(packId, phraseId) {
  const pack = getPackById(packId);
  if (!pack) return;
  const id = normalizePhraseId(phraseId);
  if (id === null) return;

  const idx = pack.phraseIds.indexOf(id);
  if (idx >= 0) {
    pack.phraseIds.splice(idx, 1);
  } else {
    pack.phraseIds.push(id);
  }
  savePacks();
  renderTravelPanel();
}

async function syncFavoritesFromSupabase() {
  if (!supabase) return;
  try {
    const session = await getSession();
    if (!session) return;
    const { data, error } = await supabase
      .from("favorites")
      .select("phrase_id")
      .eq("user_id", session.user.id);
    if (error) throw error;

    const ids = (data || [])
      .map((row) => Number(row?.phrase_id))
      .filter((n) => Number.isFinite(n));

    PHRASE_STATE.favorites = new Set(ids);
    savePhraseFavorites();
    renderPhraseList();
    renderTravelPanel();
    updateProfileUI();
  } catch (err) {
    console.warn("[favorites] Failed to sync from Supabase.", err);
  }
}

function loadPhraseFavorites() {
  try {
    const raw = localStorage.getItem(PHRASE_STORAGE_KEY);
    const arr = JSON.parse(raw || "[]");
    if (Array.isArray(arr)) {
      PHRASE_STATE.favorites = new Set(arr.filter((n) => Number.isFinite(Number(n))));
    }
  } catch {}
  updateProfileUI();
}

function savePhraseFavorites() {
  const arr = Array.from(PHRASE_STATE.favorites);
  localStorage.setItem(PHRASE_STORAGE_KEY, JSON.stringify(arr));
  updateProfileUI();
}

function loadFavoritesOnly() {
  const raw = localStorage.getItem(PHRASE_FAVORITES_ONLY_KEY);
  PHRASE_STATE.favoritesOnly = raw === "1";
}

function saveFavoritesOnly() {
  localStorage.setItem(PHRASE_FAVORITES_ONLY_KEY, PHRASE_STATE.favoritesOnly ? "1" : "0");
}

function getPhraseById(id) {
  const key = normalizePhraseId(id);
  if (key === null) return null;
  const all = getAllPhrases();
  return all.find((p) => p.id === key) || null;
}

function phraseMatchesQuery(p, q) {
  if (!q) return true;
  const t = q.toLowerCase();
  return (
    p.en.toLowerCase().includes(t) ||
    p.ko.toLowerCase().includes(t) ||
    String(p.romanization || "").toLowerCase().includes(t)
  );
}

function renderPhraseList() {
  const listEl = $("#phraseList");
  const emptyEl = $("#phraseEmpty");
  if (!listEl) return;

  if (PHRASE_STATE.loading) {
    listEl.innerHTML = "";
    if (emptyEl) {
      emptyEl.textContent = "Loading phrases...";
      emptyEl.style.display = "block";
    }
    return;
  }

  if (PHRASE_STATE.loadError) {
    listEl.innerHTML = "";
    if (emptyEl) {
      emptyEl.textContent = "Failed to load phrases. Please refresh.";
      emptyEl.style.display = "block";
    }
    return;
  }

  const q = (PHRASE_STATE.query || "").trim();
  const cat = PHRASE_STATE.category || "All";
  const favOnly = PHRASE_STATE.favoritesOnly;

  const filtered = PHRASE_STATE.phrases.filter((p) => {
    if (cat !== "All" && p.category !== cat) return false;
    if (favOnly && !PHRASE_STATE.favorites.has(p.id)) return false;
    return phraseMatchesQuery(p, q);
  });

  if (!filtered.length) {
    listEl.innerHTML = "";
    if (emptyEl) {
      if (favOnly && PHRASE_STATE.favorites.size === 0) {
        emptyEl.textContent = "No favorites yet. Tap the star to save phrases.";
      } else {
        emptyEl.textContent = "No phrases found.";
      }
      emptyEl.style.display = "block";
    }
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";

  listEl.innerHTML = filtered
    .map((p) => {
      const isFav = PHRASE_STATE.favorites.has(p.id);
      const en = escapeHtml(p.en);
      const meta = escapeHtml(p.category);
      const rank = Number(p.rank) || PHRASE_STATE.phrases.findIndex((x) => x.id === p.id) + 1;
      return `
        <div class="phraseItem" data-id="${p.id}">
          <button class="phraseItem__main" type="button" aria-label="Open phrase ${rank}">
            <div class="phraseItem__rank">${rank}</div>
            <div>
              <div class="phraseItem__en">${en}</div>
              <div class="phraseItem__meta">${meta}</div>
            </div>
          </button>
          <button class="phraseFav ${isFav ? "is-active" : ""}" type="button" aria-pressed="${isFav}" aria-label="Toggle favorite">
            ${isFav ? "&#9733;" : "&#9734;"}
          </button>
        </div>
      `;
    })
    .join("");
}

function openPhraseDetail(p) {
  const modal = $("#phraseModal");
  if (!modal || !p) return;

  PHRASE_STATE.selectedId = p.id;

  $("#phraseDetailEnBody").textContent = p.en;
  $("#phraseDetailKo").textContent = p.ko;
  $("#phraseDetailRoman").textContent = p.romanization;

  const favBtn = $("#phraseToggleFav");
  const isFav = PHRASE_STATE.favorites.has(p.id);
  if (favBtn) {
    favBtn.textContent = isFav ? "Remove favorite" : "Add favorite";
  }

  const status = $("#phraseSpeechStatus");
  if (status) status.textContent = "";

  modal.hidden = false;
}

function closePhraseDetail() {
  const modal = $("#phraseModal");
  if (modal) modal.hidden = true;
}

async function togglePhraseFavorite(id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return;
  const wasFav = PHRASE_STATE.favorites.has(n);
  if (wasFav) {
    PHRASE_STATE.favorites.delete(n);
  } else {
    PHRASE_STATE.favorites.add(n);
  }
  savePhraseFavorites();
  renderPhraseList();

  if (PHRASE_STATE.selectedId === n) {
    const favBtn = $("#phraseToggleFav");
    const isFav = PHRASE_STATE.favorites.has(n);
    if (favBtn) favBtn.textContent = isFav ? "Remove favorite" : "Add favorite";
  }
  renderTravelPanel();

  if (!supabase) return;
  try {
    const session = await getSession();
    if (!session) return;
    const userId = session.user.id;
    if (wasFav) {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("phrase_id", n);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("favorites")
        .upsert({ user_id: userId, phrase_id: n });
      if (error) throw error;
    }
  } catch (err) {
    console.warn("[favorites] Failed to sync toggle to Supabase.", err);
  }
}

function speakKorean(text) {
  const status = $("#phraseSpeechStatus");
  if (status) status.textContent = "";

  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    if (status) status.textContent = "??브라?��????�성 ?�생??지?�하지 ?�습?�다.";
    return;
  }

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ko-KR";

  const voices = speechSynthesis.getVoices();
  const koVoice = voices.find((v) => String(v.lang || "").toLowerCase().startsWith("ko"));
  if (koVoice) utter.voice = koVoice;

  utter.onerror = () => {
    if (status) status.textContent = "?�성 ?�생???�패?�습?�다.";
  };

  try {
    speechSynthesis.cancel();
    speechSynthesis.speak(utter);
  } catch {
    if (status) status.textContent = "?�성 ?�생???�패?�습?�다.";
  }
}

function setupPhrases() {
  // English UI copy + labels (index.html remains unchanged)
  const pageTitle = $("#page-phrases .pageHeader__title");
  if (pageTitle) pageTitle.textContent = "Top phrases for travelers";
  const pageDesc = $("#page-phrases .pageHeader__desc");
  if (pageDesc) pageDesc.textContent = "Tap a phrase to see Korean + romanization, then play it.";

  const search = $("#phraseSearch");
  if (search) search.placeholder = "Search (English / Korean / romanization)";

  const filterLabels = [
    { key: "All", label: "All" },
    { key: "Airport", label: "Airport" },
    { key: "Transport", label: "Transport" },
    { key: "Food", label: "Food" },
    { key: "Shopping", label: "Shopping" },
    { key: "Emergency", label: "Emergency" },
    { key: "Other", label: "Other" },
  ];

  const filterButtons = $$("#phraseFilters .chip--filter");
  filterButtons.forEach((btn, idx) => {
    const cfg = filterLabels[idx];
    if (!cfg) return;
    btn.dataset.filter = cfg.key;
    btn.textContent = cfg.label;
  });

  const modal = $("#phraseModal");
  if (modal) {
    const title = modal.querySelector(".sheet__title");
    if (title) title.textContent = "Phrase details";
    const body = modal.querySelector(".sheet__body");
    if (body) {
      body.innerHTML = `
        <div class="sheet__label">English</div>
        <div class="sheet__text" id="phraseDetailEnBody"></div>
        <div class="sheet__label">Korean</div>
        <div class="sheet__text" id="phraseDetailKo"></div>
        <div class="sheet__label">Romanization</div>
        <div class="sheet__text" id="phraseDetailRoman"></div>
        <div class="row">
          <button class="btn btn--primary" id="phrasePlay" type="button">Play</button>
          <button class="btn btn--ghost" id="phraseToggleFav" type="button">Add favorite</button>
        </div>
        <div class="status" id="phraseSpeechStatus" aria-live="polite"></div>
      `;
    }
  }

  // Packs UI (injected into Phrases page)
  loadPacks();
  const phrasesPage = $("#page-phrases");
  if (phrasesPage && !$("#packsArea")) {
    const packsArea = document.createElement("div");
    packsArea.className = "packsArea";
    packsArea.id = "packsArea";
    packsArea.innerHTML = `
      <div class="card card--inner">
        <div class="packsHead">
          <div>
            <div class="packsTitle">My Packs</div>
            <div class="muted small">Create a pack and add phrases to it.</div>
          </div>
          <div class="packsCreate">
            <input id="packNameInput" class="input" placeholder="Pack name" autocomplete="off" />
            <button class="btn btn--primary" id="btnCreatePack" type="button">Create Pack</button>
          </div>
        </div>
        <div class="packsBody">
          <div class="packsList" id="packsList"></div>
          <div class="packDetail" id="packDetail"></div>
        </div>
      </div>
    `;
    phrasesPage.appendChild(packsArea);
  }

  ensureCustomPhraseModal();

  loadPhraseFavorites();
  loadFavoritesOnly();
  renderPhraseList();

  PHRASE_STATE.loading = true;
  PHRASE_STATE.loadError = false;
  renderPhraseList();

  fetch("/data/phrases.json", { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      const list = Array.isArray(data) ? data : [];
      let excluded = 0;
      const seenIds = new Set();
      const validated = [];

      list.forEach((p) => {
        const id = Number(p?.id);
        const rank = Number(p?.rank);
        const category = String(p?.category || "");
        const en = String(p?.en || "");
        const ko = String(p?.ko || "");
        const romanization = String(p?.romanization || "");

        const valid =
          Number.isFinite(id) &&
          Number.isFinite(rank) &&
          category.trim().length > 0 &&
          en.trim().length > 0 &&
          ko.trim().length > 0 &&
          romanization.trim().length > 0;

        if (!valid) {
          excluded += 1;
          return;
        }
        if (seenIds.has(id)) {
          excluded += 1;
          return;
        }

        seenIds.add(id);
        validated.push({ id, rank, category, en, ko, romanization });
      });

      if (excluded > 0) {
        console.warn(`[phrases] Excluded ${excluded} invalid or duplicate items.`);
      }

      PHRASE_STATE.phrases = validated.sort((a, b) => a.rank - b.rank);
      PHRASE_STATE.loading = false;
      PHRASE_STATE.loadError = false;
      renderPhraseList();
      renderPacksUI();
      renderTravelPanel();
    })
    .catch(() => {
      PHRASE_STATE.loading = false;
      PHRASE_STATE.loadError = true;
      renderPhraseList();
      renderPacksUI();
      renderTravelPanel();
    });

  $("#phraseSearch")?.addEventListener("input", (e) => {
    PHRASE_STATE.query = e.target.value || "";
    renderPhraseList();
  });

  $("#phraseFilters")?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-filter]");
    if (!btn) return;
    const f = String(btn.dataset.filter || "All");
    PHRASE_STATE.category = f;
    $$("#phraseFilters .chip--filter").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.filter === f)
    );
    renderPhraseList();
  });

  $("#phraseList")?.addEventListener("click", (e) => {
    const fav = e.target?.closest?.(".phraseFav");
    if (fav) {
      const card = fav.closest(".phraseItem");
      togglePhraseFavorite(card?.dataset?.id);
      return;
    }

    const main = e.target?.closest?.(".phraseItem__main");
    if (!main) return;
    const card = main.closest(".phraseItem");
    const p = getPhraseById(card?.dataset?.id);
    if (p) openPhraseDetail(p);
  });

  $("#phraseModal")?.addEventListener("click", (e) => {
    const close = e.target?.closest?.("[data-close='1']");
    if (close) closePhraseDetail();
  });

  $("#phrasePlay")?.addEventListener("click", () => {
    const p = getPhraseById(PHRASE_STATE.selectedId);
    if (!p) return;
    speakKorean(p.ko);
  });

  $("#phraseToggleFav")?.addEventListener("click", () => {
    togglePhraseFavorite(PHRASE_STATE.selectedId);
  });

  const toggleHost = $(".phraseSearch");
  if (toggleHost && !$("#phraseFavToggle")) {
    const wrap = document.createElement("div");
    wrap.className = "phraseToggle";
    wrap.innerHTML = `
      <button class="chip chip--toggle" id="phraseFavToggle" type="button" aria-pressed="false">Favorites</button>
    `;
    toggleHost.appendChild(wrap);
  }

  const favToggle = $("#phraseFavToggle");
  if (favToggle) {
    favToggle.setAttribute("aria-pressed", PHRASE_STATE.favoritesOnly ? "true" : "false");
    favToggle.classList.toggle("is-active", PHRASE_STATE.favoritesOnly);
    favToggle.addEventListener("click", () => {
      PHRASE_STATE.favoritesOnly = !PHRASE_STATE.favoritesOnly;
      saveFavoritesOnly();
      favToggle.setAttribute("aria-pressed", PHRASE_STATE.favoritesOnly ? "true" : "false");
      favToggle.classList.toggle("is-active", PHRASE_STATE.favoritesOnly);
      renderPhraseList();
    });
  }

  renderPacksUI();

  $("#packsList")?.addEventListener("click", (e) => {
    const del = e.target?.closest?.("button[data-action='delete']");
    if (del) {
      const item = del.closest(".packItem");
      const id = item?.dataset?.id;
      if (id) {
        deletePack(id);
        renderPacksUI();
      }
      return;
    }

    const main = e.target?.closest?.(".packItem__main");
    if (!main) return;
    const item = main.closest(".packItem");
    const id = item?.dataset?.id || "";
    PACK_STATE.selectedPackId = id;
    renderPacksUI();
  });

  $("#btnCreatePack")?.addEventListener("click", () => {
    const input = $("#packNameInput");
    const name = (input?.value || "").trim();
    if (!name) return;
    const pack = createPack(name);
    if (pack) {
      PACK_STATE.selectedPackId = pack.id;
      if (input) input.value = "";
      renderPacksUI();
    }
  });

  // If logged in, sync favorites from Supabase at start.
  if (supabase) {
    syncFavoritesFromSupabase();
    syncCustomPhrasesFromSupabase();
  } else {
    loadCustomPhrases();
  }
}

function renderPacksList() {
  const list = $("#packsList");
  if (!list) return;

  if (!PACK_STATE.packs.length) {
    list.innerHTML = `<div class="muted small">No packs yet.</div>`;
    return;
  }

  list.innerHTML = PACK_STATE.packs
    .map(
      (p) => `
      <div class="packItem ${PACK_STATE.selectedPackId === p.id ? "is-active" : ""}" data-id="${p.id}">
        <button class="packItem__main" type="button">
          <div class="packItem__name">${escapeHtml(p.name)}</div>
          <div class="packItem__meta">${p.phraseIds.length} phrases</div>
        </button>
        <button class="btn btn--ghost btn--small" data-action="delete" type="button">Delete</button>
      </div>
    `
    )
    .join("");
}

function renderPackDetail() {
  const detail = $("#packDetail");
  if (!detail) return;

  const pack = getPackById(PACK_STATE.selectedPackId);
  if (!pack) {
    detail.innerHTML = `<div class="muted small">Select a pack to manage phrases.</div>`;
    return;
  }

  const q = (PACK_STATE.query || "").trim();
  const cat = PACK_STATE.category || "All";
  const allPhrases = getAllPhrases();
  const list = allPhrases.filter((p) => {
    if (cat !== "All" && p.category !== cat) return false;
    return phraseMatchesQuery(p, q);
  });
  const addedList = allPhrases.filter((p) => pack.phraseIds.includes(p.id));

  detail.innerHTML = `
    <div class="packDetail__head">
      <div>
        <div class="packDetail__title">${escapeHtml(pack.name)}</div>
        <div class="packDetail__count">${pack.phraseIds.length} phrases</div>
      </div>
      <button class="btn btn--ghost btn--small" id="btnClosePack" type="button">Close</button>
    </div>

    <div class="packSection">
      <div class="packSection__title">In this pack</div>
      <div class="packAdded__list" id="packAddedList"></div>
    </div>

    <div class="packSection">
      <div class="packSection__head">
        <div class="packSection__title">Add phrases</div>
        <button class="btn btn--ghost btn--small" id="btnAddCustomPhrase" type="button">Add custom phrase</button>
      </div>
      <div class="packCustomEmpty" id="packCustomEmpty" style="display:none"></div>
      <div class="packFilters">
        <input id="packSearch" class="input" placeholder="Search phrases" value="${escapeHtml(q)}" />
        <div class="filters" id="packFilters"></div>
      </div>
      <div class="packPhraseList" id="packPhraseList"></div>
    </div>
  `;

  const filterHost = $("#packFilters");
  if (filterHost) {
    const labels = ["All", "Airport", "Transport", "Food", "Shopping", "Emergency", "Other", "Custom"];
    filterHost.innerHTML = labels
      .map(
        (l) =>
          `<button class="chip chip--filter ${l === cat ? "is-active" : ""}" data-filter="${l}" type="button">${l}</button>`
      )
      .join("");
  }

  const listEl = $("#packPhraseList");
  if (listEl) {
    listEl.innerHTML = list
      .map((p) => {
        const added = pack.phraseIds.includes(p.id);
        const isCustom = p.category === "Custom" && typeof p.id === "string";
        return `
          <div class="packPhraseItem ${added ? "is-added" : ""}" data-id="${p.id}">
            <div class="packPhraseItem__text">
              <div class="packPhraseItem__en">${escapeHtml(p.en)}</div>
              <div class="packPhraseItem__meta">${escapeHtml(p.category)}</div>
            </div>
            <div class="packPhraseItem__actions">
              ${
                added
                  ? `<button class="packToggleBtn is-added" type="button" disabled aria-label="Added">Added</button>`
                  : `<button class="packToggleBtn is-add" data-action="toggle" type="button" aria-label="Add to pack">+ Pack</button>`
              }
              ${
                isCustom
                  ? `<button class="packDeleteBtn" data-action="delete-custom" type="button" aria-label="Delete">Delete</button>`
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");
  }

  const addedEl = $("#packAddedList");
  if (addedEl) {
    if (!addedList.length) {
      addedEl.innerHTML = `<div class="muted small">No phrases added yet.</div>`;
    } else {
      addedEl.innerHTML = addedList
        .map(
          (p) => `
          <div class="packAddedItem" data-id="${p.id}">
            <div>
              <div class="packAddedItem__en">${escapeHtml(p.en)}</div>
              <div class="packAddedItem__meta">${escapeHtml(p.category)}</div>
            </div>
            <button class="packRemoveBtn" type="button" data-action="remove" aria-label="Remove from pack">Remove</button>
          </div>
        `
        )
        .join("");
    }
  }

  const customEmpty = $("#packCustomEmpty");
  if (customEmpty) {
    if (CUSTOM_STATE.phrases.length === 0) {
      customEmpty.textContent = "No custom phrases yet. Add one to get started.";
      customEmpty.style.display = "block";
    } else {
      customEmpty.textContent = "";
      customEmpty.style.display = "none";
    }
  }

  $("#btnClosePack")?.addEventListener("click", () => {
    PACK_STATE.selectedPackId = "";
    renderPacksUI();
  });

  $("#packSearch")?.addEventListener("input", (e) => {
    PACK_STATE.query = e.target.value || "";
    renderPackDetail();
  });

  $("#packFilters")?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-filter]");
    if (!btn) return;
    PACK_STATE.category = String(btn.dataset.filter || "All");
    renderPackDetail();
  });

  $("#packPhraseList")?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-action='toggle']");
    if (!btn) return;
    const item = btn.closest(".packPhraseItem");
    const id = item?.dataset?.id;
    const isAdded = item?.classList.contains("is-added");
    if (isAdded && item) {
      item.classList.add("is-removing");
      setTimeout(() => {
        togglePhraseInPack(pack.id, id);
        renderPacksUI();
      }, 180);
      return;
    }
    togglePhraseInPack(pack.id, id);
    renderPacksUI();
  });

  $("#packPhraseList")?.addEventListener("click", (e) => {
    const del = e.target?.closest?.("button[data-action='delete-custom']");
    if (!del) return;
    const item = del.closest(".packPhraseItem");
    const id = item?.dataset?.id;
    const ok = confirm("Delete this custom phrase? This will remove it from any packs.");
    if (!ok) return;
    deleteCustomPhrase(id);
    renderPacksUI();
    renderTravelPanel();
  });

  $("#packAddedList")?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-action='remove']");
    if (!btn) return;
    const item = btn.closest(".packAddedItem");
    const id = item?.dataset?.id;
    if (item) item.classList.add("is-removing");
    setTimeout(() => {
      togglePhraseInPack(pack.id, id);
      renderPacksUI();
    }, 180);
  });

  $("#btnAddCustomPhrase")?.addEventListener("click", () => {
    openCustomPhraseModal();
  });
}

function renderPacksUI() {
  const area = $("#packsArea");
  if (area) {
    area.classList.toggle("is-detail", !!PACK_STATE.selectedPackId);
  }
  renderPacksList();
  renderPackDetail();
  updateProfileUI();
}

function ensureCustomPhraseModal() {
  if ($("#customPhraseModal")) return;
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "customPhraseModal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal__backdrop" data-close="1"></div>
    <div class="modal__card" role="dialog" aria-modal="true" aria-label="Add custom phrase">
      <div class="modal__head">
        <div class="modal__title">Add custom phrase</div>
        <button class="iconBtn" data-close="1" type="button" aria-label="Close">×</button>
      </div>
      <form id="customPhraseForm" class="form">
        <label class="label" for="customEn">English</label>
        <input id="customEn" class="input" placeholder="Required" autocomplete="off" />

        <label class="label" for="customKo">Korean</label>
        <input id="customKo" class="input" placeholder="Required" autocomplete="off" />

        <label class="label" for="customRoman">Romanization</label>
        <input id="customRoman" class="input" placeholder="Optional" autocomplete="off" />

        <div class="row">
          <button class="btn btn--primary" type="submit">Save</button>
          <button class="btn btn--ghost" type="button" data-close="1">Cancel</button>
        </div>
        <div class="status" id="customPhraseStatus" aria-live="polite"></div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener("click", (e) => {
    const close = e.target?.closest?.("[data-close='1']");
    if (close) closeCustomPhraseModal();
  });

  $("#customPhraseForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const en = $("#customEn")?.value || "";
    const ko = $("#customKo")?.value || "";
    const roman = $("#customRoman")?.value || "";
    const status = $("#customPhraseStatus");
    if (status) status.textContent = "";

    if (!String(en).trim() || !String(ko).trim()) {
      if (status) status.textContent = "English and Korean are required.";
      return;
    }

    const validation = validateCustomPhrase(en, ko, roman);
    if (!validation.ok) {
      if (status) {
        status.textContent =
          validation.reason === "spam"
            ? "Please avoid profanity or spam."
            : "Please check the length.";
      }
      return;
    }

    const id = `custom_${Date.now()}`;
    const entry = {
      id,
      category: "Custom",
      en: String(en).trim(),
      ko: String(ko).trim(),
      romanization: String(roman).trim(),
      createdAt: Date.now(),
    };
    CUSTOM_STATE.phrases.unshift(entry);
    saveCustomPhrases();
    upsertCustomPhraseToSupabase(entry);

    if ($("#customEn")) $("#customEn").value = "";
    if ($("#customKo")) $("#customKo").value = "";
    if ($("#customRoman")) $("#customRoman").value = "";
    if (status) status.textContent = "";

    closeCustomPhraseModal();
    renderPacksUI();
    renderTravelPanel();
    updateProfileUI();
  });
}

function openCustomPhraseModal() {
  ensureCustomPhraseModal();
  const modal = $("#customPhraseModal");
  const status = $("#customPhraseStatus");
  if (status) status.textContent = "";
  if (modal) modal.hidden = false;
}

function closeCustomPhraseModal() {
  const modal = $("#customPhraseModal");
  if (modal) modal.hidden = true;
}

/* ----------------------------- TRAVEL MODE ----------------------------- */

const TRAVEL_CATEGORIES = [
  { key: "Airport", label: "Airport" },
  { key: "Transport", label: "Transit" },
  { key: "Food", label: "Food" },
  { key: "Emergency", label: "Emergency" },
  { key: "Favorites", label: "Polite" },
  { key: "MyPacks", label: "My Packs" },
];

let TRAVEL_STATE = {
  category: "",
  packId: "",
};

function ensureTravelModeUI() {
  const main = $(".main");
  if (!main || $("#page-travel")) return;

  const footer = main.querySelector(".footer");
  const section = document.createElement("section");
  section.className = "page";
  section.id = "page-travel";
  section.dataset.page = "travel";
  section.hidden = true;
  section.innerHTML = `
    <div class="pageHeader">
      <h2 class="pageHeader__title">Quick Speak Travel Mode</h2>
      <p class="pageHeader__desc">Tap a big button to play Korean instantly.</p>
    </div>

    <div class="travelMode">
      <div class="travelMode__cats" id="travelCats"></div>
      <div class="travelMode__panel" id="travelPanel"></div>
    </div>
  `;

  if (footer) {
    main.insertBefore(section, footer);
  } else {
    main.appendChild(section);
  }
}

function ensureTravelBigModal() {
  if ($("#travelBigModal")) return;
  const modal = document.createElement("div");
  modal.className = "travelBigModal";
  modal.id = "travelBigModal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="travelBigModal__backdrop" data-close="1"></div>
    <div class="travelBigModal__card" role="dialog" aria-modal="true" aria-label="Big text">
      <div class="travelBigModal__actions">
        <button class="btn btn--ghost btn--small" data-close="1" type="button">Close</button>
      </div>
      <div class="travelBigModal__text" id="travelBigText">-</div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => {
    if (e.target?.closest?.("[data-close='1']")) {
      modal.hidden = true;
      document.body.classList.remove("is-sheet-open");
    }
  });
}

function openTravelBigModal(text) {
  ensureTravelBigModal();
  const modal = $("#travelBigModal");
  const target = $("#travelBigText");
  if (target) target.textContent = text || "-";
  if (modal) {
    modal.hidden = false;
    document.body.classList.add("is-sheet-open");
  }
}

function ensureTravelModeButton() {
  const actions = $(".topbar__actions");
  if (!actions || $("#btnTravelMode")) return;
  const btn = document.createElement("button");
  btn.className = "btn btn--ghost btn--small";
  btn.id = "btnTravelMode";
  btn.type = "button";
  btn.textContent = "Travel Mode";
  btn.addEventListener("click", () => {
    location.hash = "#travel";
  });
  actions.insertBefore(btn, actions.firstChild);
}

function renderTravelCategories() {
  const cats = $("#travelCats");
  if (!cats) return;

  cats.innerHTML = TRAVEL_CATEGORIES.map(
    (c) => `
      <button class="travelCat" type="button" data-cat="${c.key}">
        <span class="travelCat__label">${c.label}</span>
      </button>
    `
  ).join("");

  cats.querySelectorAll(".travelCat").forEach((btn) => {
    btn.addEventListener("click", () => {
      TRAVEL_STATE.category = btn.dataset.cat || "";
      TRAVEL_STATE.packId = "";
      renderTravelPanel();
    });
  });
}

function getTravelPhrases() {
  if (PHRASE_STATE.loading) return { status: "loading", items: [] };
  if (PHRASE_STATE.loadError) return { status: "error", items: [] };

  const cat = TRAVEL_STATE.category;
  if (!cat) return { status: "empty", items: [] };
  if (cat === "MyPacks") return { status: "packs", items: [] };

  let items = PHRASE_STATE.phrases.slice();
  if (cat === "Favorites") {
    items = items.filter((p) => PHRASE_STATE.favorites.has(p.id));
  } else {
    items = items.filter((p) => p.category === cat);
  }

  return { status: "ok", items };
}

function renderTravelPanel() {
  const panel = $("#travelPanel");
  if (!panel) return;

  if (!TRAVEL_STATE.category) {
    panel.innerHTML = `
      <div class="travelHint">Choose a category to start.</div>
    `;
    return;
  }

  const { status, items } = getTravelPhrases();

  if (status === "loading") {
    panel.innerHTML = `<div class="travelHint">Loading phrases...</div>`;
    return;
  }
  if (status === "error") {
    panel.innerHTML = `<div class="travelHint">Failed to load phrases. Please refresh.</div>`;
    return;
  }
  if (status === "packs") {
    renderTravelPacks(panel);
    return;
  }

  const isFavorites = TRAVEL_STATE.category === "Favorites";
  const title = isFavorites ? "Favorites" : TRAVEL_STATE.category;
  if (!items.length) {
    const emptyMsg = isFavorites
      ? "No favorites yet. Tap the star on phrases to save them."
      : "No phrases available.";
    panel.innerHTML = `
      <div class="travelPanel__head">
        <button class="btn btn--ghost btn--small" id="travelBack" type="button">Back</button>
        <div class="travelPanel__title">${title}</div>
      </div>
      <div class="travelHint">${emptyMsg}</div>
    `;
  } else {
    panel.innerHTML = `
      <div class="travelPanel__head">
        <button class="btn btn--ghost btn--small" id="travelBack" type="button">Back</button>
        <div class="travelPanel__title">${title}</div>
      </div>
      <div class="travelGrid">
        ${items
          .map(
            (p) => `
            <div class="travelPhraseCard" data-id="${p.id}">
              <button class="travelPhraseBtn" type="button" data-id="${p.id}">
                <div class="travelPhraseBtn__en">${escapeHtml(p.en)}</div>
                <div class="travelPhraseBtn__ko">${escapeHtml(p.ko)}</div>
              </button>
              <button class="travelBigBtn" type="button" data-id="${p.id}">Show big</button>
              ${
                isFavorites
                  ? `<button class="travelFavRemove" type="button" data-id="${p.id}" aria-label="Remove favorite">??/button>`
                  : ""
              }
            </div>
          `
          )
          .join("")}
      </div>
    `;
  }

  $("#travelBack")?.addEventListener("click", () => {
    TRAVEL_STATE.category = "";
    renderTravelPanel();
  });

  panel.querySelectorAll(".travelPhraseBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = getPhraseById(btn.dataset.id);
      if (!p) return;
      speakKorean(p.ko);
    });
  });

  panel.querySelectorAll(".travelBigBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = getPhraseById(btn.dataset.id);
      if (!p) return;
      openTravelBigModal(p.ko);
    });
  });

  panel.querySelectorAll(".travelFavRemove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePhraseFavorite(btn.dataset.id);
    });
  });
}

function renderTravelPacks(panel) {
  if (!panel) return;

  if (!TRAVEL_STATE.packId) {
    if (!PACK_STATE.packs.length) {
      panel.innerHTML = `
        <div class="travelPanel__head">
          <button class="btn btn--ghost btn--small" id="travelBack" type="button">Back</button>
          <div class="travelPanel__title">My Packs</div>
        </div>
        <div class="travelHint">No packs yet. Create one in Phrases.</div>
      `;
    } else {
      panel.innerHTML = `
        <div class="travelPanel__head">
          <button class="btn btn--ghost btn--small" id="travelBack" type="button">Back</button>
          <div class="travelPanel__title">My Packs</div>
        </div>
        <div class="travelPacksGrid">
          ${PACK_STATE.packs
            .map(
              (p) => `
              <button class="travelPackCard" type="button" data-pack="${p.id}">
                <div class="travelPackCard__name">${escapeHtml(p.name)}</div>
                <div class="travelPackCard__meta">${p.phraseIds.length} phrases</div>
              </button>
            `
            )
            .join("")}
        </div>
      `;
    }

    $("#travelBack")?.addEventListener("click", () => {
      TRAVEL_STATE.category = "";
      renderTravelPanel();
    });

    panel.querySelectorAll(".travelPackCard").forEach((btn) => {
      btn.addEventListener("click", () => {
        TRAVEL_STATE.packId = btn.dataset.pack || "";
        renderTravelPanel();
      });
    });

    return;
  }

  const pack = getPackById(TRAVEL_STATE.packId);
  const ids = pack ? pack.phraseIds : [];
  const items = getAllPhrases().filter((p) => ids.includes(p.id));

  if (!items.length) {
    panel.innerHTML = `
      <div class="travelPanel__head">
        <button class="btn btn--ghost btn--small" id="travelBack" type="button">Back</button>
        <div class="travelPanel__title">${escapeHtml(pack?.name || "Pack")}</div>
      </div>
      <div class="travelHint">This pack is empty. Add phrases first.</div>
    `;
  } else {
    panel.innerHTML = `
      <div class="travelPanel__head">
        <button class="btn btn--ghost btn--small" id="travelBack" type="button">Back</button>
        <div class="travelPanel__title">${escapeHtml(pack?.name || "Pack")}</div>
      </div>
      <div class="travelGrid">
        ${items
          .map(
            (p) => `
            <div class="travelPhraseCard" data-id="${p.id}">
              <button class="travelPhraseBtn" type="button" data-id="${p.id}">
                <div class="travelPhraseBtn__en">${escapeHtml(p.en)}</div>
                <div class="travelPhraseBtn__ko">${escapeHtml(p.ko)}</div>
              </button>
              <button class="travelBigBtn" type="button" data-id="${p.id}">Show big</button>
              ${
                typeof p.id === "number"
                  ? `<button class="travelFavRemove" type="button" data-id="${p.id}" aria-label="Toggle favorite">
                      ${PHRASE_STATE.favorites.has(p.id) ? "&#9733;" : "&#9734;"}
                    </button>`
                  : ""
              }
            </div>
          `
          )
          .join("")}
      </div>
    `;
  }

  $("#travelBack")?.addEventListener("click", () => {
    TRAVEL_STATE.packId = "";
    renderTravelPanel();
  });

  panel.querySelectorAll(".travelPhraseBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = getPhraseById(btn.dataset.id);
      if (!p) return;
      speakKorean(p.ko);
    });
  });

  panel.querySelectorAll(".travelBigBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = getPhraseById(btn.dataset.id);
      if (!p) return;
      openTravelBigModal(p.ko);
    });
  });

  panel.querySelectorAll(".travelFavRemove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePhraseFavorite(btn.dataset.id);
      renderTravelPanel();
    });
  });
}

function setupTravelMode() {
  ensureTravelModeUI();
  ensureTravelModeButton();
  renderTravelCategories();
  renderTravelPanel();
}

/* ----------------------------- KOREA NOW ------------------------------- */

let NOW_CACHE = null;

function renderNowList(container, items) {
  const el = $(container);
  if (!el) return;

  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    el.innerHTML = `<div class="muted small">No items yet.</div>`;
    return;
  }

  el.innerHTML = list.slice(0, 8).map((it) => {
    const title = escapeHtml(it.title || "Untitled");
    const desc = escapeHtml(it.desc || "");
    const tag = escapeHtml(it.tag || "");
    const link = (it.link || "").trim();
    const source = escapeHtml(it.source || "Source");

    return `
      <div class="nowItem">
        <div class="nowItem__title">${title}</div>
        ${desc ? `<div class="nowItem__desc">${desc}</div>` : ""}
        <div class="nowItem__meta">
          ${tag ? `<span class="nowTag">${tag}</span>` : `<span></span>`}
          ${link ? `<a class="iconBtn" href="${escapeHtml(link)}" target="_blank" rel="noreferrer" title="${source}">??/a>` : `<span></span>`}
        </div>
      </div>
    `;
  }).join("");
}

async function loadKoreaNow(forceReload) {
  const status = $("#nowStatus");
  if (status) status.textContent = "Loading...";

  if (NOW_CACHE && !forceReload) {
    renderNowList("#nowEssentials", NOW_CACHE.travel_essentials);
    renderNowList("#nowTrending", NOW_CACHE.trending);
    renderNowList("#nowIssues", NOW_CACHE.major_issues);
    if (status) status.textContent = NOW_CACHE.lastVerified ? `Updated: ${NOW_CACHE.lastVerified}` : "";
    return;
  }

  try {
    const url = forceReload ? `/data/korea_now.json?ts=${Date.now()}` : "/data/korea_now.json";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load korea_now.json (HTTP ${res.status})`);

    const data = await res.json();
    NOW_CACHE = data;

    renderNowList("#nowEssentials", data.travel_essentials);
    renderNowList("#nowTrending", data.trending);
    renderNowList("#nowIssues", data.major_issues);

    if (status) status.textContent = data.lastVerified ? `Updated: ${data.lastVerified}` : "";
  } catch (err) {
    if (status) status.textContent = `Error: ${err?.message || err}`;
    renderNowList("#nowEssentials", []);
    renderNowList("#nowTrending", []);
    renderNowList("#nowIssues", []);
  }
}

/* ----------------------------- INSTALL (PWA) ---------------------------- */

let deferredPrompt = null;

function setupInstallPrompt() {
  const btn = $("#btnInstall");
  if (!btn) return;

  btn.style.display = "none";

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.style.display = "inline-flex";
  });

  btn.addEventListener("click", async () => {
    if (!deferredPrompt) {
      toast("Use your browser menu ??Install / Add to Home Screen.");
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    btn.style.display = "none";
  });
}

/* ----------------------------- BACKEND URL UI --------------------------- */

function loadBackendSettingsUI() {
  const input = $("#backendUrl");
  const status = $("#backendStatus");
  if (!input || !status) return;

  const current = getBackendOrigin();
  input.value = current || "";

  if (isNativeShell()) {
    status.textContent = current ? `Saved: ${current}` : "Not set yet. Paste your Vercel URL here.";
  } else {
    status.textContent = "Web mode: backend uses same origin (no setting needed).";
  }
}

function saveBackendOrigin() {
  const input = $("#backendUrl");
  const status = $("#backendStatus");
  if (!input || !status) return;

  const v = (input.value || "").trim();
  if (!v) {
    status.textContent = "Paste a backend URL first.";
    return;
  }
  localStorage.setItem(STORAGE_BACKEND_KEY, v);
  status.textContent = `Saved: ${v}`;
  toast("Saved backend URL");
}

function resetBackendOrigin() {
  localStorage.removeItem(STORAGE_BACKEND_KEY);
  loadBackendSettingsUI();
  toast("Reset backend URL");
}

/* ----------------------------- SERVICE WORKER --------------------------- */

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/service-worker.js").catch(() => {});
}

function isLocalhost() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function isDevEnabled() {
  try {
    return localStorage.getItem("iamkim_dev") === "1";
  } catch {
    return false;
  }
}

function applyDevOnlyVisibility(root = document) {
  const enabled = isDevEnabled();
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll(".devOnly").forEach((el) => {
    el.hidden = !enabled;
  });
}

let devOnlyObserver;

function setupDevOnlyObserver() {
  if (devOnlyObserver) return;
  const target = document.body || document.documentElement;
  if (!target) return;
  devOnlyObserver = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes?.forEach?.((node) => {
        if (!node || node.nodeType !== 1) return;
        if (node.matches?.(".devOnly")) {
          applyDevOnlyVisibility(node.parentNode || document);
          return;
        }
        if (node.querySelectorAll) applyDevOnlyVisibility(node);
      });
    });
  });
  devOnlyObserver.observe(target, { childList: true, subtree: true });
}

window.setDevMode = (on) => {
  try {
    if (on) {
      localStorage.setItem("iamkim_dev", "1");
    } else {
      localStorage.removeItem("iamkim_dev");
    }
  } catch {}
  applyDevOnlyVisibility();
  try {
    const isDev = isLocalhost() || isDevEnabled();
    document.documentElement.classList.toggle("is-dev", isDev);
  } catch {}
};

function devUnregisterServiceWorkersAndClearCaches() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .catch(() => {});

  if ("caches" in window) {
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .catch(() => {});
  }
}

function ensureAppContext() {
  if (!window.App) window.App = {};
  return window.App;
}

function buildAppContext() {
  const app = ensureAppContext();
  Object.assign(app, {
    $,
    $$,
    supabase,
    toast,
    escapeHtml,
    truncateText,
    defaultAvatar,
    normalizeAvatar,
    avatarSrc,
    PROFILE_STATE,
    setNicknameBannerVisible,
    loadAvatarFromLocalStorage,
    updateNicknameBadge,
    updateProfileUI,
    syncFavoritesFromSupabase,
    syncCustomPhrasesFromSupabase,
    loadNicknameFromSupabase,
    renderTravelPanel,
    loadCustomPhrases,
    currentRoute,
    navigateToHome,
    refreshQuotaPill,
    loadKoreaNow,
    initKoreaNow,
    ensureEmergencySheet,
    openEmergencySheet,
    closeEmergencySheet,
  });
}

async function loadAppModules() {
  buildAppContext();
  const app = ensureAppContext();

  // 1) AUTH
  const auth = await import("./app/auth.js");
  ({
    getSession,
    getAccessToken,
    processOAuthCallback,
    setupAuthButtons,
    ensureAuthSheetUI,
    openAuthSheet,
    signOut,
    loadBanStatus,
    subscribeBanRealtime,
  } = auth);

  Object.assign(app, {
    getSession,
    getAccessToken,
    processOAuthCallback,
    setupAuthButtons,
    ensureAuthSheetUI,
    openAuthSheet,
    signOut,
    updateMobileAuthButton,
    loadBanStatus,
    subscribeBanRealtime,
  });

  // 2) HOME
  const home = await import("./app/home.js");
  ({
    youtubeIdFromUrl,
    normalizeYoutubeUrl,
    renderVideoPlayer,
    setWatchStatus,
    setText,
    setList,
    parseTimestampToSeconds,
    renderWatchMoments,
    setWatchInsights,
    analyzeHomeUrl,
    clearHome,
    renderFeaturedVideos,
    setupHome,
  } = home);

  Object.assign(app, {
    youtubeIdFromUrl,
    normalizeYoutubeUrl,
    renderVideoPlayer,
    setWatchStatus,
    setText,
    setList,
    parseTimestampToSeconds,
    renderWatchMoments,
    setWatchInsights,
    analyzeHomeUrl,
    clearHome,
    renderFeaturedVideos,
    setupHome,
  });

  // 3) COMMUNITY
  const community = await import("./app/community.js");
  ({ ensureCommentReportModal, setupCommunity, loadCommunityPosts } = community);
  Object.assign(app, {
    ensureCommentReportModal,
    setupCommunity,
    loadCommunityPosts,
  });

  // 3.5) KOREA NOW
  const now = await import("./app/korea_now.js");
  ({ initKoreaNow } = now);
  Object.assign(app, { initKoreaNow });

  // 4) ADMIN
  const admin = await import("./app/admin.js");
  ({ ensureAdminUI, loadAdminPanel, clearAdminState, clearAdminRefreshTimer } = admin);
  Object.assign(app, {
    ensureAdminUI,
    loadAdminPanel,
    clearAdminState,
    clearAdminRefreshTimer,
  });
}

async function boot() {
  await loadAppModules();
  await init();
}
/* ----------------------------- INIT ------------------------------------ */

async function init() {
  // 0) DEV: If a service worker was ever installed on this origin, it can keep
  // serving stale JS/CSS and make the UI feel "frozen". Nuke it in dev.
  if (isLocalhost()) {
    devUnregisterServiceWorkersAndClearCaches();
  }
  try {
    const isDev = isLocalhost() || isDevEnabled();
    document.documentElement.classList.toggle("is-dev", isDev);
  } catch {}
  applyDevOnlyVisibility();
  setupDevOnlyObserver();

  // 1) OAuth callback handling (store session before routing/auth checks)
  await processOAuthCallback();

  if (isNativeShell()) {
    document.body.classList.add("is-native-shell");
  }

  

  // year
  const y = $("#year");
  if (y) y.textContent = String(new Date().getFullYear());

  // auth
  setupAuthButtons();
  ensureAuthSheetUI?.();
  ensureMobileTopbar();
  bindMobileAuthButton();
  ensureNicknameUI();
  ensureNicknameBadge();
  ensureProfileUI();
  loadAvatarFromLocalStorage();
  loadNicknameFromSupabase();
  loadBanStatus();
  subscribeBanRealtime();

  // logo -> home
  const brand = document.querySelector(".brand");
  if (brand) {
    brand.addEventListener("click", () => {
      location.hash = "#home";
    });
  }

  // home
  if (typeof setupHome === "function") {
    setupHome();
  } else {
    console.warn("[home] setupHome missing");
  }

  // phrases
  setupPhrases();
  setupTravelMode();
  bindAvatarControls();
  updateProfileUI();

  // admin
  ensureAdminUI();
  ensureContactModal();
  ensureCommentReportModal();

  // korea now
  $("#btnReloadNow")?.addEventListener("click", () => initKoreaNow?.({ mode: "mykorea" }));
  initKoreaNow?.({ mode: "mykorea" });

  // community
  setupCommunity();

  // install
  setupInstallPrompt();

  // backend settings
  $("#btnSaveBackend")?.addEventListener("click", saveBackendOrigin);
  $("#btnResetBackend")?.addEventListener("click", resetBackendOrigin);
  loadBackendSettingsUI();

  // routing
  updateBottomTabbarRoutes();
  setActiveRoute(currentRoute());
  window.addEventListener("hashchange", () => setActiveRoute(currentRoute()));

  // logout delegation for dynamic elements
  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.('[data-auth-action="logout"]');
    if (!btn) return;
    window.App?.signOut?.();
  });

  // pwa
  registerServiceWorker();

  // initial quota pill
  refreshQuotaPill().catch(() => {});

  updateMobileAuthButton();
  window.addEventListener("auth:changed", () => updateMobileAuthButton());
  if (supabase?.auth?.onAuthStateChange) {
    supabase.auth.onAuthStateChange(() => updateMobileAuthButton());
  }
}

boot().catch((err) => console.warn("[init] Failed.", err));










