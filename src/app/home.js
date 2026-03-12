// src/app/home.js
// Home module (YouTube -> travel skim)
import { safeOpen } from "./deeplinks.js";
const {
  $,
  escapeHtml,
  toast,
  getAccessToken,
  apiUrl,
  isNativeShell,
  getBackendOrigin,
  setQuotaPillText,
  STORAGE_QUOTA_REMAINING,
} = window.App || {};
const t = window.App?.t || ((k) => k);

let HOME_LOADING = false;
let HOME_COLLECTION_ACTIVE = "";
let HOME_COLLECTION_QUERY = "";
const HOME_LIBRARY_URL = "/data/library.json";
let HOME_LIBRARY_COLLECTIONS = [];

/* ----------------------------- HOME: VIDEO ----------------------------- */

function youtubeIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "");
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const m = u.pathname.match(/\/shorts\/([^/]+)/);
    if (m) return m[1];
  } catch {}
  return "";
}

function normalizeYoutubeUrl(url) {
  const id = youtubeIdFromUrl(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : url;
}

function renderVideoPlayer(videoUrl, startAtSeconds = 0, autoplay = false) {
  const el = $("#videoPlayer");
  if (!el) return;

  const id = youtubeIdFromUrl(videoUrl);
  if (!id) {
    el.innerHTML = `
      <div class="empty">
        <div class="empty__title">Invalid YouTube URL</div>
        <div class="empty__desc">Paste a normal YouTube link.</div>
      </div>
    `;
    return;
  }

  const start = Math.max(0, Math.floor(Number(startAtSeconds) || 0));
  const auto = autoplay ? 1 : 0;

  const src =
    `https://www.youtube.com/embed/${id}` +
    `?start=${start}&autoplay=${auto}&mute=0&rel=0&modestbranding=1&playsinline=1`;

  el.innerHTML = `
    <div class="player__ratio">
      <iframe
        src="${src}"
        title="YouTube video"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    </div>
  `;
}

function setWatchStatus(text) {
  const el = $("#watchSkimStatus");
  if (el) el.textContent = String(text || "");
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = String(text || "");
}

function setList(id, items) {
  const el = $(id);
  if (!el) return;
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) {
    el.innerHTML = `<li class="muted small">No items yet. Extract a video to see results.</li>`;
    return;
  }
  el.innerHTML = arr
    .slice(0, 10)
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join("");
}

function parseTimestampToSeconds(ts) {
  // supports "MM:SS" or "HH:MM:SS"
  const t = String(ts || "").trim();
  if (!t) return 0;
  const parts = t.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return 0;

  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
  if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return 0;
}

function renderWatchMoments(moments, videoUrl) {
  const el = $("#watchMoments");
  if (!el) return;

  const list = Array.isArray(moments) ? moments.slice(0, 10) : [];
  if (!list.length) {
    el.innerHTML = `<div class="muted small">No key moments found.</div>`;
    return;
  }

  el.innerHTML = list
    .map((m) => {
      const time = escapeHtml(m?.time || "");
      const title = escapeHtml(m?.title || "");
      const why = escapeHtml(m?.why || "");
      const sec = parseTimestampToSeconds(m?.time || "");
      const canJump = videoUrl && sec > 0;

      return `
        <button class="moment" type="button" data-sec="${sec}" ${canJump ? "" : "disabled"}>
          <span class="moment__time">${time || "-"}</span>
          <span>
            <span class="moment__title">${title || "Moment"}</span>
            ${why ? `<span class="moment__why">${why}</span>` : ""}
          </span>
        </button>
      `;
    })
    .join("");

  // click -> jump
  el.querySelectorAll(".moment").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sec = Number(btn.dataset.sec || 0);
      if (!videoUrl || !Number.isFinite(sec) || sec <= 0) return;
      renderVideoPlayer(videoUrl, sec, true);
      toast(`Jumped to ${btn.querySelector(".moment__time")?.textContent || ""}`);
    });
  });
}

function setWatchInsights({ insights, summaryText, videoUrl, remaining }) {
  setText("#watchTldr", insights?.summary || "No summary yet. Extract a video to get a quick skim.");
  setList("#watchMustKnows", insights?.must_know || []);
  setList("#watchPlacesFoods", insights?.places_foods || []);
  renderWatchMoments(insights?.key_moments || [], videoUrl);

  const details = $("#watchMore");
  const full = $("#watchFull");
  if (details && full) {
    if (summaryText) {
      details.style.display = "block";
      full.textContent = summaryText;
    } else {
      details.style.display = "none";
      full.textContent = "";
    }
  }

  if (Number.isFinite(remaining)) {
    localStorage.setItem(STORAGE_QUOTA_REMAINING, String(Math.max(0, remaining)));
    if (typeof setQuotaPillText === "function") {
      setQuotaPillText(`${Math.max(0, remaining)} free left`);
    }
  }
}

function showSampleInsights(url) {
  const sample = {
    summary: "Quick skim: This trip focuses on transit, key neighborhoods, and timing tips for a smoother first visit.",
    must_know: [
      "Buy a T-money card at the airport and load small cash first.",
      "Subway transfers are easy, but allow extra time at major stations.",
      "Avoid peak rush hours if you have luggage.",
    ],
    places_foods: [
      "Myeongdong street food",
      "Gwangjang Market",
      "Hongdae late-night cafes",
    ],
    key_moments: [
      { time: "02:10", title: "Airport to city options", why: "AREX vs bus vs taxi" },
      { time: "05:40", title: "Transit card tips", why: "Where to buy and top up" },
      { time: "08:05", title: "Neighborhood pick", why: "Which area fits your vibe" },
    ],
  };
  setWatchInsights({ insights: sample, summaryText: "", videoUrl: url, remaining: NaN });
}

function setHomeLoading(isLoading) {
  HOME_LOADING = !!isLoading;
  const btn = $("#btnHomeAnalyze");
  if (btn) {
    btn.disabled = HOME_LOADING;
    btn.classList.toggle("is-disabled", HOME_LOADING);
    btn.textContent = HOME_LOADING ? "Extracting..." : "Play & Extract";
  }
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.hidden = !HOME_LOADING;
}

async function analyzeHomeUrl() {
  if (HOME_LOADING) return;
  setHomeLoading(true);

  try {
    const input = $("#homeYoutubeUrl");
    const raw = (input?.value || "").trim();

    if (!raw) {
      setWatchStatus("Paste a YouTube link first.");
      return;
    }

    const url = normalizeYoutubeUrl(raw);

    // render player immediately
    renderVideoPlayer(url, 0, false);

    // require backend origin for native shell
    if (isNativeShell && isNativeShell() && !getBackendOrigin()) {
      setWatchStatus("Set your backend URL in About -> Backend base URL.");
      return;
    }

    // require login
    const token = await getAccessToken?.();
    if (!token) {
      setWatchStatus("Please sign in to use the free analysis.");
      return;
    }

    setWatchStatus("Extracting travel tips...");

    const isLocalHost =
      location.hostname === "localhost" || location.hostname === "127.0.0.1";
    const summarizeEndpoint = isLocalHost
      ? "http://localhost:8787/api/summarize"
      : (apiUrl ? apiUrl("/api/summarize") : "/api/summarize");

    const res = await fetch(summarizeEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      window.App?.openAuthSheet?.();
      setWatchStatus("Please sign in to use the free analysis.");
      return;
    }
    if (!res.ok) {
      const msg = data?.error || `Request failed (HTTP ${res.status})`;
      const details = data?.details ? ` - ${data.details}` : "";
      const raw = `${msg} ${data?.details || ""}`.toLowerCase();
      if (raw.includes("gemini_api_key") || raw.includes("missing api key")) {
        setWatchStatus("AI analysis is not configured yet. Try again later.");
        showSampleInsights(url);
      } else {
        setWatchStatus(`Error: ${msg}${details}. Please try again.`);
      }
      return;
    }

    const remainingNow = Number(data?.remaining);
    if (Number.isFinite(remainingNow)) {
      localStorage.setItem(STORAGE_QUOTA_REMAINING, String(Math.max(0, remainingNow)));
      if (typeof setQuotaPillText === "function") {
        setQuotaPillText(`${Math.max(0, remainingNow)} free left`);
      }
    }

    setWatchStatus("Done.");
    setWatchInsights({
      insights: data.insights,
      summaryText: data.summary || "",
      videoUrl: url,
      remaining: Number(data.remaining),
    });
  } catch (err) {
    setWatchStatus(`Network error: ${err?.message || err}. Please try again.`);
  } finally {
    setHomeLoading(false);
  }
}

function clearHome() {
  const input = $("#homeYoutubeUrl");
  if (input) input.value = "";

  const player = $("#videoPlayer");
  if (player) {
    player.innerHTML = `<div class="player__empty">
      <div class="player__emptyTitle">Paste a link</div>
      <div class="player__emptyDesc">We will load the video and extract travel tips.</div>
    </div>`;
  }

  setWatchStatus("Paste a link to generate insights.");
  const watchTldr = $("#watchTldr");
  if (watchTldr) watchTldr.textContent = "No summary yet. Extract a video to get a quick skim.";
  const mustKnows = $("#watchMustKnows");
  if (mustKnows) mustKnows.innerHTML = "";
  const placesFoods = $("#watchPlacesFoods");
  if (placesFoods) placesFoods.innerHTML = "";
  const moments = $("#watchMoments");
  if (moments) moments.innerHTML = "";
  const watchMore = $("#watchMore");
  if (watchMore) watchMore.style.display = "none";
  const watchFull = $("#watchFull");
  if (watchFull) watchFull.textContent = "";
}

function getCollections() {
  return Array.isArray(HOME_LIBRARY_COLLECTIONS) ? HOME_LIBRARY_COLLECTIONS : [];
}

async function loadHomeLibrary() {
  try {
    const res = await fetch(HOME_LIBRARY_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    HOME_LIBRARY_COLLECTIONS = Array.isArray(data?.collections) ? data.collections : [];
  } catch {
    HOME_LIBRARY_COLLECTIONS = [];
  }
}

function getCollectionByKey(key) {
  return getCollections().find((c) => c.key === key) || null;
}

function getCollectionVideos(collectionKey, query = "") {
  const collection = getCollectionByKey(collectionKey);
  const q = String(query || "").trim().toLowerCase();
  const list = Array.isArray(collection?.items) ? collection.items : [];
  if (!q) return list;
  return list.filter((v) => {
    const text = `${v?.title || ""} ${v?.channel || ""} ${v?.description || ""}`.toLowerCase();
    return text.includes(q);
  });
}

function renderCollectionsOverview() {
  const box = $("#homeCollections");
  if (!box) return;

  box.innerHTML = `
    <div class="collectionsHead">
      <div class="featuredTitle">Explore by Topic</div>
      <div class="muted small">Explore curated travel videos by topic.</div>
    </div>
    <div class="collectionsList">
      ${getCollections().map((item) => {
        return `
          <button class="collectionRow" type="button" data-key="${escapeHtml(item.key)}" aria-label="Open ${escapeHtml(item.title)}">
            <span class="collectionRow__text">
              <span class="collectionRow__title">${escapeHtml(item.title)}</span>
              <span class="collectionRow__desc">${escapeHtml(item.desc || item.description || "")}</span>
            </span>
            <span class="collectionRow__arrow" aria-hidden="true">&rsaquo;</span>
          </button>
        `;
      }).join("")}
    </div>
  `;

  box.querySelectorAll(".collectionRow").forEach((row) => {
    row.addEventListener("click", () => {
      const key = row.getAttribute("data-key") || "";
      if (!key) return;
      HOME_COLLECTION_ACTIVE = key;
      HOME_COLLECTION_QUERY = "";
      renderCollectionDetail();
    });
  });
}

function renderCollectionDetail() {
  const box = $("#homeCollections");
  if (!box) return;
  const collection = getCollectionByKey(HOME_COLLECTION_ACTIVE);
  if (!collection) {
    renderCollectionsOverview();
    return;
  }

  const list = getCollectionVideos(collection.key, HOME_COLLECTION_QUERY);

  box.innerHTML = `
    <div class="collectionsHead collectionsHead--detail">
      <button class="btn btn--ghost btn--small" type="button" id="collectionBackBtn">Back</button>
      <div class="featuredTitle">${escapeHtml(collection.title)}</div>
    </div>
    <div class="collectionSearch">
      <input
        id="collectionSearchInput"
        class="input"
        type="text"
        placeholder="Search this collection"
        autocomplete="off"
        value="${escapeHtml(HOME_COLLECTION_QUERY)}"
      />
    </div>
    <div class="collectionsBody">
      ${
        !list.length
          ? `<div class="collectionEmpty">No videos yet.</div>`
          : `<div class="collectionList">${list
              .map(
                (v) => `
            <article class="collectionListItem" data-url="${escapeHtml(v.url || "")}">
              <div class="collectionListItem__title">${escapeHtml(v.title || "")}</div>
              <div class="collectionListItem__meta">${escapeHtml(v.channel || "")}</div>
            </article>`
              )
              .join("")}</div>`
      }
    </div>
  `;

  $("#collectionBackBtn")?.addEventListener("click", () => {
    HOME_COLLECTION_ACTIVE = "";
    HOME_COLLECTION_QUERY = "";
    renderCollectionsOverview();
  });

  $("#collectionSearchInput")?.addEventListener("input", (e) => {
    HOME_COLLECTION_QUERY = e?.target?.value || "";
    renderCollectionDetail();
  });

  box.querySelectorAll(".collectionListItem").forEach((item) => {
    item.addEventListener("click", () => {
      const url = item.getAttribute("data-url") || "";
      if (!url) return;
      location.hash = "#info";
      setTimeout(() => {
        document.getElementById("videoPlayer")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
      const input = document.getElementById("homeYoutubeUrl");
      if (input) input.value = url;
      renderVideoPlayer(url);
      setWatchStatus("Loaded.");
    });
  });
}

function renderCollectionsSection() {
  if (HOME_COLLECTION_ACTIVE) {
    renderCollectionDetail();
    return;
  }
  renderCollectionsOverview();
}

// ── Hero strip card definitions ───────────────────────────────────────────────

const HERO_CARDS_STATIC = [
  { badge: "K-POP",    title: "Concert day essentials",       img: "/hero/hero_kpop_concert_v2.webp",  href: "#kpop" },
  { badge: "EVENT",    title: "Festival sale & deals",        img: "/hero/hero_fandom_line_v2.webp",   href: "#k?tab=deals" },
  { badge: "SHOPPING", title: "Official merch & album shops", img: "/hero/hero_album_display.webp",    href: "#k?tab=shopping" },
  { badge: "SEOUL",    title: "Korea travel updates",         img: "/hero/hero_seoul_night.webp",      href: "#news" },
  { badge: "BEAUTY",   title: "K-beauty stores to try",       img: "/hero/hero_kbeauty_shop.webp",     href: "#k?tab=beauty" },
  { badge: "FOOD",     title: "Street food favorites",        img: "/hero/hero_kfood_street.webp",     href: "#k?tab=food" },
];

function buildHeroCardEl(card) {
  const btn = document.createElement("button");
  btn.className = "heroCard" + (card.partner ? " heroCard--partner" : "");
  btn.type = "button";
  if (card.img) {
    btn.style.setProperty("--bg", `url('${card.img}')`);
  } else if (card.gradient) {
    btn.style.background = card.gradient;
  }
  const badgeClass = card.partner
    ? "heroCard__badge heroCard__badge--partner"
    : "heroCard__badge";
  btn.innerHTML = `
    <span class="${badgeClass}">${escapeHtml(card.badge)}</span>
    <span class="heroCard__title">${escapeHtml(card.title)}</span>
  `;
  if (card.onClick) {
    btn.addEventListener("click", card.onClick);
  } else if (card.href) {
    btn.addEventListener("click", () => { location.hash = card.href; });
  }
  return btn;
}

// Rebuilds heroStrip__track with the given cards array.
// Stops and resets the auto-slide timer so the caller can restart it.
function renderHeroStripCards(cards) {
  const track = document.querySelector("#page-home .heroStrip__track");
  if (!track) return;
  stopHeroStripAutoSlide();
  track.innerHTML = "";
  (cards || HERO_CARDS_STATIC).forEach((card) => track.appendChild(buildHeroCardEl(card)));
}

// ── Hero strip auto-slide ─────────────────────────────────────────────────────

let HERO_STRIP_SLIDE_TIMER = null;
let HERO_STRIP_INDEX = 0;

function startHeroStripAutoSlide() {
  stopHeroStripAutoSlide();
  HERO_STRIP_INDEX = 0;
  HERO_STRIP_SLIDE_TIMER = setInterval(() => {
    if (!isHomeActive()) return;
    const track = document.querySelector("#page-home .heroStrip__track");
    if (!track) return;
    const cards = track.querySelectorAll(".heroCard");
    if (cards.length <= 1) return;
    HERO_STRIP_INDEX = (HERO_STRIP_INDEX + 1) % cards.length;
    const card = cards[HERO_STRIP_INDEX];
    // getBoundingClientRect gives position relative to viewport; scrollBy the delta
    const dx = card.getBoundingClientRect().left - track.getBoundingClientRect().left;
    track.scrollBy({ left: dx, behavior: "smooth" });
  }, 3500);
}

function stopHeroStripAutoSlide() {
  if (HERO_STRIP_SLIDE_TIMER) {
    clearInterval(HERO_STRIP_SLIDE_TIMER);
    HERO_STRIP_SLIDE_TIMER = null;
  }
  HERO_STRIP_INDEX = 0;
}

// ── Home layout ───────────────────────────────────────────────────────────────

function renderHomeLayout() {
  const page = $("#page-home");
  if (!page) return;
  page.innerHTML = `
    <section class="homeSection homeSection--hero">
      <div class="homeHero">
        <section class="heroStrip">
          <div class="heroStrip__track"></div>
        </section>
        <div class="homeHero__cta">
          <button class="askSearch" id="btnAskKim" type="button">
            <span class="askSearch__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/>
                <path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </span>
            <span class="askSearch__text">Ask KIM anything</span>
          </button>
        </div>
      </div>
    </section>

    <section class="homeSection">
      <div class="sectionHead">
        <div class="sectionTitle">Quick actions</div>
      </div>
      <div class="quickActions">
        <button class="quickAction" type="button" data-action="travel">
          <span class="quickAction__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" stroke="currentColor" stroke-width="1.82" stroke-linejoin="round"/>
              <path d="M12 7v10M5.5 9.5l6.5 3.5 6.5-3.5" stroke="currentColor" stroke-width="1.82" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="quickAction__label">Travel Mode</span>
        </button>
        <button class="quickAction" type="button" data-action="map">
          <span class="quickAction__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M9 18l-5 2V6l5-2 6 2 5-2v14l-5 2-6-2z" stroke="currentColor" stroke-width="1.82" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M9 4v14M15 6v14" stroke="currentColor" stroke-width="1.82" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="quickAction__label">Map</span>
        </button>
        <button class="quickAction" type="button" data-action="taxi">
          <span class="quickAction__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 13l2-5h12l2 5" stroke="currentColor" stroke-width="1.82" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M6 13h12v5H6z" stroke="currentColor" stroke-width="1.82" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="8" cy="18" r="1.5" stroke="currentColor" stroke-width="1.82"/>
              <circle cx="16" cy="18" r="1.5" stroke="currentColor" stroke-width="1.82"/>
            </svg>
          </span>
          <span class="quickAction__label">Taxi</span>
        </button>
        <button class="quickAction" type="button" data-action="subway">
          <span class="quickAction__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="6" y="3.5" width="12" height="14" rx="2.5" stroke="currentColor" stroke-width="1.82"/>
              <path d="M6 8h12" stroke="currentColor" stroke-width="1.82" stroke-linecap="round"/>
              <circle cx="9" cy="14" r="1.2" stroke="currentColor" stroke-width="1.82"/>
              <circle cx="15" cy="14" r="1.2" stroke="currentColor" stroke-width="1.82"/>
              <path d="M8 21l2-2h4l2 2" stroke="currentColor" stroke-width="1.82" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="quickAction__label">Subway</span>
        </button>
        <button class="quickAction" type="button" data-action="safety">
          <span class="quickAction__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 3l7 3v6c0 4.2-2.7 7.2-7 9-4.3-1.8-7-4.8-7-9V6l7-3z" stroke="currentColor" stroke-width="1.82" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M9.5 12.5l2 2 3.5-3.5" stroke="currentColor" stroke-width="1.82" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="quickAction__label">Safety</span>
        </button>
        <button class="quickAction" type="button" data-action="papago">
          <span class="quickAction__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M7 6h10a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H9l-4 3v-3H7a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z" stroke="currentColor" stroke-width="1.82" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M8.5 10h7M8.5 13h4.5" stroke="currentColor" stroke-width="1.82" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="quickAction__label">Papago</span>
        </button>
        <button class="quickAction" type="button" data-action="exchange">
          <span class="quickAction__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M7 8h10l-2.5-2.5M17 16H7l2.5 2.5" stroke="currentColor" stroke-width="1.82" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M7 8v6M17 16V10" stroke="currentColor" stroke-width="1.82" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="quickAction__label">Exchange</span>
        </button>
        <button class="quickAction" type="button" data-action="phrases">
          <span class="quickAction__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M6 4h9a4 4 0 0 1 0 8H6z" stroke="currentColor" stroke-width="1.82" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M6 12v8" stroke="currentColor" stroke-width="1.82" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="quickAction__label">Phrases</span>
        </button>
      </div>
    </section>

    <section class="homeSection">
      <div class="sectionHead">
        <div>
          <div class="sectionTitle">Note</div>
          <div class="sectionDesc">Travel updates and useful information.</div>
        </div>
        <button class="btn btn--ghost btn--small" id="btnEditHomePicks" type="button" style="display:none">Edit</button>
      </div>
        <div class="previewCarousel" id="homeNowPreview">
        <div class="previewTrack homeNowTrack" id="homeNowTrack" data-scroll="1"></div>
          <div class="previewDots" id="homeNowDots">
            <button class="dot is-active" type="button" data-idx="0"></button>
            <button class="dot" type="button" data-idx="1"></button>
            <button class="dot" type="button" data-idx="2"></button>
            <button class="dot" type="button" data-idx="3"></button>
            <button class="dot" type="button" data-idx="4"></button>
          </div>
        </div>
      </section>

    <section class="homeSection">
      <div class="sectionHead">
        <div>
          <div class="sectionTitle">HOT</div>
          <div class="sectionDesc">Most liked posts this week.</div>
        </div>
      </div>
      <div class="communityPreviewWrap community-preview-bleed">
        <div class="communityPreviewGrid" id="homeCommunityPreview"></div>
      </div>
    </section>
  `;
}

function bindCommunityPreviewNavigation() {
  const host = document.getElementById("homeCommunityPreview");
  if (!host || host.dataset.bound === "1") return;
  host.dataset.bound = "1";
  host.addEventListener("click", (e) => {
    const card = e.target?.closest?.(".communityPreviewCard[data-post-id]");
    if (!card) return;
    const postId = card.dataset.postId;
    if (!postId) return;
    sessionStorage.setItem("communityFocusPostId", postId);
    location.hash = "#community";
  });
}

function updateLangSelector() {
  const selector = document.getElementById("langSelector");
  if (!selector) return;
  const currentLang = window.App?.getLang ? window.App.getLang() : 'en';
  selector.querySelectorAll(".langBtn").forEach((btn) => {
    btn.classList.toggle("langBtn--active", btn.dataset.lang === currentLang);
  });
}

function renderInfoLayout() {
  const page = $("#page-info");
  if (!page) return;
  page.innerHTML = `
    <div class="langSelector" id="langSelector">
      <button class="langBtn" data-lang="en" type="button">EN</button>
      <button class="langBtn" data-lang="ja" type="button">日本語</button>
      <button class="langBtn" data-lang="zh" type="button">中文</button>
    </div>

    <section class="homeSection homeSection--hero">
      <div class="homeHero">
        <div class="homeHero__title">${t('home_card_title')}</div>
        <div class="homeHero__subtitle">${t('home_hero_subtitle')}</div>
      </div>

      <div class="analyzeBox" id="analyzeBox">
        <div class="analyzeBox__head">
          <div class="analyzeBox__title">${t('home_watchbar_kicker')}</div>
          <div class="analyzeBox__desc">${t('home_watchbar_desc')}</div>
        </div>
        <div class="analyzeRow">
          <input id="homeYoutubeUrl" class="input input--xl" placeholder="${t('home_input_youtube')}" autocomplete="off" />
          <button class="btn btn--primary btn--xl" id="btnHomeAnalyze" type="button">${t('btn_play_extract')}</button>
          <button class="btn btn--ghost btn--xl" id="btnHomeClear" type="button">${t('btn_clear')}</button>
        </div>
        <div class="analyzeMeta analyzeMeta--link">
          <button class="btn btn--ghost btn--small chipLink" type="button" id="btnGoLibrary">Browse Category Library</button>
        </div>
        <div class="analyzeMeta">
          <span class="badge badge--soft" id="watchQuotaPill" style="display:none"></span>
        </div>
      </div>

      <div id="videoPlayer" class="player"></div>

      <div class="resultsGrid">
        <div class="resultsCard">
          <div class="resultsTitle">${t('home_skim_label_quick')}</div>
          <div class="resultsBody" id="watchTldr"></div>
          <div class="muted small" id="watchSkimStatus">${t('home_skim_status_default')}</div>
          <div class="callout" id="watchAuthHint" style="display:none">${t('home_auth_hint')}</div>
          <details class="details" id="watchMore" style="display:none">
            <summary>${t('home_skim_full_notes')}</summary>
            <div class="output" id="watchFull"></div>
          </details>
        </div>
        <div class="resultsCard">
          <div class="resultsTitle">${t('home_skim_label_mustknows')}</div>
          <ul class="bullets bullets--tight" id="watchMustKnows"></ul>
          <div class="resultsTitle">${t('home_skim_label_moments')}</div>
          <div class="moments" id="watchMoments"></div>
          <div class="resultsTitle">${t('home_skim_label_places')}</div>
          <ul class="bullets bullets--tight" id="watchPlacesFoods"></ul>
        </div>
      </div>
    </section>

    <section class="homeSection" id="home-library">
      <div class="sectionHead">
        <div class="sectionTitle">${t('home_gallery_title')}</div>
        <div class="sectionDesc">${t('home_gallery_hint')}</div>
      </div>
      <div id="homeCollections" class="collectionsWrap"></div>
    </section>
  `;

  // Wire up language selector buttons
  updateLangSelector();
  const selector = document.getElementById("langSelector");
  if (selector) {
    selector.addEventListener("click", (e) => {
      const btn = e.target?.closest?.(".langBtn");
      if (!btn) return;
      const lang = btn.dataset.lang;
      if (lang && window.App?.setLang) {
        window.App.setLang(lang);
      }
    });
  }
}

function getApp() {
  return window.App || {};
}

function openExternal(url) {
  const target = String(url || "").trim();
  if (!target) return;
  // Capacitor 래핑 시 아래 주석을 활성화하고 위의 window.open을 제거하세요:
  // if (isNativeShell && isNativeShell()) {
  //   import("@capacitor/browser").then(({ Browser }) => Browser.open({ url: target }));
  //   return;
  // }
  window.open(target, "_blank", "noopener,noreferrer");
}

async function isAdminUser() {
  const supabase = getApp().supabase;
  if (!supabase) return false;
  try {
    const userResp = await supabase.auth.getUser();
    const uid = userResp?.data?.user?.id || null;
    if (!uid) return false;
    const { data: roleRow, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .eq("role", "admin")
      .maybeSingle();
    if (error) throw error;
    return roleRow?.role === "admin";
  } catch {
    return false;
  }
}

function ensureHomePicksModal() {
  if (document.querySelector("#homePicksModal")) return;
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "homePicksModal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal__backdrop" data-close="1"></div>
    <div class="modal__card" role="dialog" aria-modal="true" aria-label="Edit Home Picks">
      <div class="modal__head">
        <div class="modal__title">Edit Home Picks</div>
        <button class="iconBtn" data-close="1" type="button" aria-label="Close"></button>
      </div>
      <div class="modal__body" id="homePicksBody"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" data-close="1" type="button">Cancel</button>
        <button class="btn btn--primary" id="btnSaveHomePicks" type="button">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => {
    if (e.target?.closest?.("[data-close='1']")) modal.hidden = true;
  });
}

function renderHomePicksForm(rows) {
  const body = document.getElementById("homePicksBody");
  if (!body) return;
    const map = new Map((rows || []).map((r) => [Number(r.slot), r]));
    body.innerHTML = [1, 2, 3, 4, 5]
    .map((slot) => {
      const row = map.get(slot) || {};
      return `
        <div class="card" style="margin-bottom:10px;">
          <div class="muted small" style="margin-bottom:6px;">Slot ${slot}</div>
          <div class="grid">
            <label class="field">
              <div class="field__label">Source</div>
              <select class="input" data-slot="${slot}" data-field="source">
                <option value="k_posts" ${row.source === "k_posts" ? "selected" : ""}>k_posts</option>
                <option value="korea_now_posts" ${row.source === "korea_now_posts" ? "selected" : ""}>korea_now_posts</option>
              </select>
            </label>
            <label class="field">
              <div class="field__label">Source ID</div>
              <input class="input" data-slot="${slot}" data-field="source_id" value="${escapeHtml(
                row.source_id || ""
              )}" />
            </label>
            <label class="field">
              <div class="field__label">Title override</div>
              <input class="input" data-slot="${slot}" data-field="title_override" value="${escapeHtml(
                row.title_override || ""
              )}" />
            </label>
            <label class="field">
              <div class="field__label">Subtitle override</div>
              <input class="input" data-slot="${slot}" data-field="subtitle_override" value="${escapeHtml(
                row.subtitle_override || ""
              )}" />
            </label>
            <label class="field">
              <div class="field__label">Link hash</div>
              <input class="input" data-slot="${slot}" data-field="link_hash" value="${escapeHtml(
                row.link_hash || ""
              )}" />
            </label>
          </div>
        </div>
      `;
    })
    .join("");
}

async function openHomePicksModal() {
  const supabase = getApp().supabase;
  if (!supabase) return;
  ensureHomePicksModal();
  const modal = document.getElementById("homePicksModal");
  if (!modal) return;
  const { data } = await supabase.from("home_featured").select("*").order("slot");
  renderHomePicksForm(data || []);
  modal.hidden = false;
}

async function saveHomePicks() {
  const supabase = getApp().supabase;
  if (!supabase) return;
  const inputs = Array.from(document.querySelectorAll("#homePicksBody [data-slot][data-field]"));
  const bySlot = new Map();
  inputs.forEach((el) => {
    const slot = Number(el.dataset.slot);
    const field = el.dataset.field;
    if (!bySlot.has(slot)) bySlot.set(slot, {});
    bySlot.get(slot)[field] = String(el.value || "").trim();
  });
  const rows = Array.from(bySlot.entries()).map(([slot, row]) => ({
    slot,
    source: row.source || "",
    source_id: row.source_id || "",
    title_override: row.title_override || null,
    subtitle_override: row.subtitle_override || null,
    link_hash: row.link_hash || null,
  }));
  await supabase.from("home_featured").upsert(rows, { onConflict: "slot" });
  const modal = document.getElementById("homePicksModal");
  if (modal) modal.hidden = true;
  await loadNowPreview();
}

let HOME_CAROUSEL_TIMER = null;
let HOME_CAROUSEL_INDEX = 0;

function isHomeActive() {
  const page = document.getElementById("page-home");
  return page && !page.hidden;
}

  function startHomeCarousel() {
    if (HOME_CAROUSEL_TIMER) return;
    const root = document.querySelector("#page-home");
    if (!root) return;
    const host = root.querySelector("#homeNowPreview");
    const track = root.querySelector("#homeNowTrack");
    const dots = root.querySelector("#homeNowDots");
    if (track?.dataset?.scroll === "1") return;
    if (!host || !track || !dots) return;

  const total = () => track.querySelectorAll(".previewCard").length;
  const applyIndex = () => {
    if (!isHomeActive()) return;
    const max = Math.max(0, total() - 1);
    HOME_CAROUSEL_INDEX = Math.min(Math.max(HOME_CAROUSEL_INDEX, 0), max);
    track.style.transform = `translateX(${-HOME_CAROUSEL_INDEX * 100}%)`;
    dots.querySelectorAll(".dot").forEach((d, i) => {
      d.classList.toggle("is-active", i === HOME_CAROUSEL_INDEX);
    });
  };

  applyIndex();
  HOME_CAROUSEL_TIMER = setInterval(() => {
    if (!isHomeActive()) return;
    const max = total();
    if (max <= 1) return;
    HOME_CAROUSEL_INDEX = (HOME_CAROUSEL_INDEX + 1) % max;
    applyIndex();
  }, 4000);
}

function stopHomeCarousel() {
  if (HOME_CAROUSEL_TIMER) {
    clearInterval(HOME_CAROUSEL_TIMER);
    HOME_CAROUSEL_TIMER = null;
  }
}

  function setupHomePreviewCarousel() {
    const host = document.getElementById("homeNowPreview");
    const track = document.getElementById("homeNowTrack");
    const dots = document.getElementById("homeNowDots");
    if (track?.dataset?.scroll === "1") return;
    if (!host || !track || !dots || host.dataset.bound === "1") return;
  host.dataset.bound = "1";

  let index = 0;
  let timer = null;
  let paused = false;
  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let deltaY = 0;
  let didSwipe = false;

  const cards = () => Array.from(track.querySelectorAll(".previewCard"));
  const total = () => cards().length;

  const setIndex = (next) => {
    if (!isHomeActive()) return;
    const max = Math.max(0, total() - 1);
    index = Math.min(Math.max(next, 0), max);
    track.style.transform = `translateX(${-index * 100}%)`;
    dots.querySelectorAll(".dot").forEach((d, i) => {
      d.classList.toggle("is-active", i === index);
    });
  };

  const tick = () => {
    if (paused) return;
    const max = total();
    if (max <= 1) return;
    setIndex((index + 1) % max);
  };

  const start = () => {
    if (HOME_CAROUSEL_TIMER) clearInterval(HOME_CAROUSEL_TIMER);
    HOME_CAROUSEL_TIMER = setInterval(tick, 4000);
  };

  const pause = () => {
    paused = true;
    if (HOME_CAROUSEL_TIMER) clearInterval(HOME_CAROUSEL_TIMER);
  };

  const resume = () => {
    paused = false;
    start();
  };

  track.addEventListener("touchstart", (e) => {
    pause();
    const t = e.touches?.[0];
    if (!t) return;
    startX = t.clientX;
    startY = t.clientY;
    deltaX = 0;
    deltaY = 0;
    didSwipe = false;
    host.dataset.swiping = "0";
  });
  track.addEventListener("touchmove", (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    deltaX = t.clientX - startX;
    deltaY = t.clientY - startY;
    if (Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(deltaY)) {
      didSwipe = true;
      host.dataset.swiping = "1";
    }
  });
  track.addEventListener("touchend", () => {
    if (didSwipe && Math.abs(deltaX) > 12) {
      setIndex(deltaX < 0 ? index + 1 : index - 1);
    }
    startX = 0;
    startY = 0;
    deltaX = 0;
    deltaY = 0;
    didSwipe = false;
    host.dataset.swiping = "0";
    resume();
  });

  host.addEventListener("mouseenter", pause);
  host.addEventListener("mouseleave", resume);

  start();
  setIndex(0);
}

async function loadNowPreview(routeToken) {
  if (routeToken && routeToken !== window.App?.routeToken) return;
  const host = document.getElementById("homeNowPreview");
  const track = document.getElementById("homeNowTrack");
  if (!host || !track) return;

  const requestId = ++loadNowPreview.requestId;
  const isVisible = () => isHomeActive() && !host.closest(".page")?.hidden;
  const clearLoadingTimeout = () => {
    if (loadNowPreview.timeoutId) clearTimeout(loadNowPreview.timeoutId);
    loadNowPreview.timeoutId = null;
  };
  const setRetry = () => {
    if (!isVisible()) return;
    track.innerHTML = `
      <div class="muted small">
        Still loading.
        <button class="btn btn--ghost btn--small" type="button" data-retry="home-now">Retry</button>
      </div>
    `;
    const btn = track.querySelector('button[data-retry="home-now"]');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        track.innerHTML = `<div class="muted small">Loading...</div>`;
        loadNowPreview(routeToken);
      });
    }
  };
  clearLoadingTimeout();
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    track.innerHTML = `<div class="muted small">You are offline. Connect to the internet to load updates.</div>`;
    return;
  }
  track.innerHTML = `<div class="muted small">Loading...</div>`;
  loadNowPreview.timeoutId = setTimeout(() => {
    if (requestId !== loadNowPreview.requestId) return;
    setRetry();
  }, 8000);

  const supabase = getApp().supabase;
  let items = [];

  try {
    if (supabase) {
      const { data: slots, error } = await supabase
        .from("home_featured")
        .select(
          "slot,source,source_id,title_override,subtitle_override,image_url_override,link_hash"
        )
        .order("slot", { ascending: true });
      if (error) throw error;

      const slotMap = new Map((slots || []).map((s) => [Number(s.slot), s]));
      const slotsNormalized = [1, 2, 3, 4, 5].map((n) => slotMap.get(n) || null);

      const resolveSlot = async (slot) => {
        if (!slot) return { placeholder: true };
        const isKSource = slot.source === "k" || slot.source === "k_posts";

        if (slot.title_override) {
          return {
            tag: isKSource ? "K" : "News",
            title: slot.title_override,
            summary: slot.subtitle_override || "",
            link: "",
            linkHash: slot.link_hash || "",
            source: slot.source || "",
          };
        }

        if (isKSource) {
          if (!slot.source_id || !String(slot.source_id).trim()) return { placeholder: true };
          const { data: row } = await supabase
            .from("k_posts")
            .select("id,title,subtitle,content,link_hash")
            .eq("id", slot.source_id)
            .maybeSingle();
          if (!row) return { placeholder: true };
          return {
            tag: "K",
            title: row.title || "Untitled",
            summary: row.subtitle || row.content || "",
            link: "",
            linkHash: row.link_hash || slot.link_hash || "",
            source: "k_posts",
          };
        }

        if (!slot.source_id || !String(slot.source_id).trim()) return { placeholder: true };
        const { data: row } = await supabase
          .from("korea_now_posts")
          .select("id,section,tag,title,summary,link")
          .eq("id", slot.source_id)
          .maybeSingle();
        if (!row) return { placeholder: true };
        return {
          tag: row.tag || row.section || "Update",
          title: row.title || "Untitled",
          summary: row.summary || "",
          link: row.link || "",
          linkHash: slot.link_hash || "",
          source: "korea_now_posts",
        };
      };

      items = await Promise.all(slotsNormalized.map((slot) => resolveSlot(slot)));
    }
  } catch (err) {
    console.warn("[home] Korea Now preview failed.", err);
    if (requestId === loadNowPreview.requestId && isVisible()) {
      track.innerHTML = `<div class="muted small">Failed to load. <button class="btn btn--ghost btn--small" type="button" data-retry="home-now">Retry</button></div>`;
      const btn = track.querySelector('[data-retry="home-now"]');
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = "1";
        btn.addEventListener("click", () => { track.innerHTML = `<div class="muted small">Loading...</div>`; loadNowPreview(routeToken); });
      }
    }
  } finally {
    if (requestId === loadNowPreview.requestId) clearLoadingTimeout();
  }

  if (requestId !== loadNowPreview.requestId) return;
  if (routeToken && routeToken !== window.App?.routeToken) return;
  if (!isVisible()) return;

    const mapHomeNowTag = (raw) => {
      const t = String(raw || "").toUpperCase();
      if (t.includes("ALERT")) return { label: "ALERT", kind: "alert" };
      if (t.includes("GUIDE")) return { label: "GUIDE", kind: "guide" };
      return { label: "NEWS", kind: "news" };
    };
    const homeNowIcon = `
      <span class="homeNowCard__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </span>
    `;

    if (!items.length) {
      track.innerHTML = `
        <div class="previewCard homeNowCard" data-kind="news">
          <div class="previewTag">${homeNowIcon}<span class="homeNowCard__badge">NEWS</span></div>
          <div class="previewTitle homeNowCard__title">Arrival checklist</div>
          <div class="previewDesc homeNowCard__desc">SIM, T-money, and airport transit tips.</div>
        </div>
        <div class="previewCard homeNowCard" data-kind="news">
          <div class="previewTag">${homeNowIcon}<span class="homeNowCard__badge">NEWS</span></div>
          <div class="previewTitle homeNowCard__title">Seasonal hotspots</div>
          <div class="previewDesc homeNowCard__desc">Popular areas and crowd windows this week.</div>
        </div>
        <div class="previewCard homeNowCard" data-kind="alert">
          <div class="previewTag">${homeNowIcon}<span class="homeNowCard__badge">ALERT</span></div>
          <div class="previewTitle homeNowCard__title">Transit changes</div>
          <div class="previewDesc homeNowCard__desc">Temporary line closures and bus reroutes.</div>
        </div>
        <div class="previewCard homeNowCard" data-kind="guide">
          <div class="previewTag">${homeNowIcon}<span class="homeNowCard__badge">GUIDE</span></div>
          <div class="previewTitle homeNowCard__title">Transit passes</div>
          <div class="previewDesc homeNowCard__desc">Which pass to buy for your routes.</div>
        </div>
        <div class="previewCard homeNowCard" data-kind="news">
          <div class="previewTag">${homeNowIcon}<span class="homeNowCard__badge">NEWS</span></div>
          <div class="previewTitle homeNowCard__title">Local events</div>
          <div class="previewDesc homeNowCard__desc">Seasonal festivals and ticket tips.</div>
        </div>
      `;
      const dots = document.getElementById("homeNowDots");
      if (dots) {
        const count = track.querySelectorAll(".previewCard").length;
        dots.style.display = count <= 1 ? "none" : "";
      }
      return;
    }

    track.innerHTML = items
      .map((it) => {
        const mapped = mapHomeNowTag(it.tag);
        return `
        ${
          it.placeholder
            ? `<div class="previewCard homeNowCard" data-placeholder="1" data-kind="news">
                <div class="previewTag">${homeNowIcon}<span class="homeNowCard__badge">NEWS</span></div>
                <div class="previewTitle homeNowCard__title">Pick an item (admin)</div>
                <div class="previewDesc homeNowCard__desc">Assign a slot in home_featured.</div>
              </div>`
            : `<button class="previewCard homeNowCard" type="button" data-kind="${mapped.kind}" data-link="${escapeHtml(
                it.link || ""
              )}" data-link-hash="${escapeHtml(it.linkHash || "")}" data-source="${escapeHtml(
                it.source || ""
              )}">
                <div class="previewTag">${homeNowIcon}<span class="homeNowCard__badge">${mapped.label}</span></div>
                <div class="previewTitle homeNowCard__title">${escapeHtml(it.title || "Untitled")}</div>
                <div class="previewDesc homeNowCard__desc">${escapeHtml(it.summary || "")}</div>
              </button>`
        }
      `;
      })
      .join("");
    const dots = document.getElementById("homeNowDots");
    if (dots) {
      const count = track.querySelectorAll(".previewCard").length;
      dots.style.display = count <= 1 ? "none" : "";
    }
}

loadNowPreview.requestId = 0;
loadNowPreview.timeoutId = null;

async function loadCommunityPreview(routeToken) {
  if (routeToken && routeToken !== window.App?.routeToken) return;
  const host = document.getElementById("homeCommunityPreview");
  if (!host) return;

  const requestId = ++loadCommunityPreview.requestId;
  const isVisible = () => isHomeActive() && !host.closest(".page")?.hidden;
  if (loadCommunityPreview.timeoutId) {
    clearTimeout(loadCommunityPreview.timeoutId);
    loadCommunityPreview.timeoutId = null;
  }
  const setRetry = () => {
    if (!isVisible()) return;
    host.innerHTML = `
      <div class="muted small">
        Still loading.
        <button class="btn btn--ghost btn--small" type="button" data-retry="home-community">Retry</button>
      </div>
    `;
    const btn = host.querySelector('button[data-retry="home-community"]');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        host.innerHTML = `<div class="muted small">Loading...</div>`;
        loadCommunityPreview(routeToken);
      });
    }
  };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    host.innerHTML = `<div class="muted small">You are offline. Connect to the internet to load updates.</div>`;
    return;
  }
  host.innerHTML = `<div class="muted small">Loading...</div>`;
  loadCommunityPreview.timeoutId = setTimeout(() => {
    if (requestId !== loadCommunityPreview.requestId) return;
    setRetry();
  }, 8000);

  const supabase = getApp().supabase;
  if (!supabase) {
    host.innerHTML = `<div class="muted small">Sign in to view community highlights.</div>`;
    if (requestId === loadCommunityPreview.requestId && loadCommunityPreview.timeoutId) {
      clearTimeout(loadCommunityPreview.timeoutId);
      loadCommunityPreview.timeoutId = null;
    }
    return;
  }

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: likeRows, error: likeError } = await supabase
      .from("post_likes")
      .select("post_id,created_at")
      .gte("created_at", since);
    if (likeError) throw likeError;

    const recentLikeCounts = new Map();
    (Array.isArray(likeRows) ? likeRows : []).forEach((row) => {
      const key = String(row?.post_id || "").trim();
      if (!key) return;
      recentLikeCounts.set(key, (recentLikeCounts.get(key) || 0) + 1);
    });

    let rows = [];

    if (recentLikeCounts.size) {
      const recentIds = Array.from(recentLikeCounts.keys());
      const { data: postsData, error: postsError } = await supabase
        .from("posts_with_likes")
        .select("id,content,image_url,like_count,created_at")
        .in("id", recentIds)
        .neq("category", "Trippal");
      if (postsError) throw postsError;

      const deduped = new Map();
      (Array.isArray(postsData) ? postsData : []).forEach((p) => {
        const key = String(p?.id || "").trim();
        if (!key || deduped.has(key)) return;
        deduped.set(key, p);
      });

      rows = Array.from(deduped.values())
        .sort((a, b) => {
          const aId = String(a?.id || "");
          const bId = String(b?.id || "");
          const aRecent = recentLikeCounts.get(aId) || 0;
          const bRecent = recentLikeCounts.get(bId) || 0;
          if (aRecent !== bRecent) return bRecent - aRecent;
          const aLikes = Number(a?.like_count || 0);
          const bLikes = Number(b?.like_count || 0);
          return bLikes - aLikes;
        })
        .slice(0, 6);
    } else {
      const { data: postsData, error: postsError } = await supabase
        .from("posts_with_likes")
        .select("id,content,image_url,like_count,created_at")
        .neq("category", "Trippal")
        .order("like_count", { ascending: false })
        .limit(6);
      if (postsError) throw postsError;
      rows = Array.isArray(postsData) ? postsData : [];
    }

    if (requestId !== loadCommunityPreview.requestId) return;
    if (!rows.length) {
      host.innerHTML = `<div class="muted small">No community posts yet.</div>`;
      return;
    }

    host.innerHTML = rows
      .map((p) => {
        const raw = String(p.content || "");
        const title = escapeHtml(raw.split("\n")[0] || "Untitled");
        const img = (p.image_url || "").trim();
        const likeCount = Number(p.like_count || 0);
        const postId = String(p.id || "");
        return `
        <button class="communityPreviewCard" type="button" data-post-id="${escapeHtml(postId)}">
          ${img ? `<div class="communityPreviewImage"><img src="${escapeHtml(img)}" alt="Community post" loading="lazy" /></div>` : ""}
          <div class="communityPreviewTitle">${title}</div>
          <div class="communityPreviewMeta">❤️ ${likeCount}</div>
        </button>
      `;
      })
      .join("");
  } catch (err) {
    console.warn("[home] Community preview failed.", err);
    if (requestId === loadCommunityPreview.requestId) {
      host.innerHTML = `<div class="muted small">Failed to load community posts.</div>`;
    }
  } finally {
    if (requestId === loadCommunityPreview.requestId && loadCommunityPreview.timeoutId) {
      clearTimeout(loadCommunityPreview.timeoutId);
      loadCommunityPreview.timeoutId = null;
    }
  }
}

loadCommunityPreview.requestId = 0;
loadCommunityPreview.timeoutId = null;

function setupHome(routeToken) {
  const homeRoot = document.querySelector("#page-home");
  const infoRoot = document.querySelector("#page-info");
  if (!homeRoot || !infoRoot) return;
  renderHomeLayout();
  // Populate hero strip with static cards and start auto-slide.
  // initPartnerEvents() (called separately) will rebuild with merged cards.
  renderHeroStripCards(HERO_CARDS_STATIC);
  startHeroStripAutoSlide();
  bindCommunityPreviewNavigation();
  renderInfoLayout();
  clearHome();

  infoRoot.querySelector("#btnHomeAnalyze")?.addEventListener("click", () => {
    analyzeHomeUrl();
  });
  infoRoot.querySelector("#btnHomeClear")?.addEventListener("click", clearHome);
  infoRoot.querySelector("#btnGoLibrary")?.addEventListener("click", async () => {
    if (location.hash !== "#info") location.hash = "#info";
    if (!HOME_LIBRARY_COLLECTIONS.length) {
      await loadHomeLibrary();
      renderCollectionsSection();
    }
    const target = infoRoot.querySelector("#homeCollections");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  homeRoot.querySelector(".quickActions")?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".quickAction");
    if (!btn) return;
    const action = btn.dataset.action || "";
    if (action === "map") {
      safeOpen("nmap://", "https://map.naver.com");
      return;
    }
    if (action === "travel") {
      location.hash = "#travel";
      return;
    }
    if (action === "taxi") {
      safeOpen(
        "kakaotaxi://",
        "https://play.google.com/store/apps/details?id=com.kakao.taxi",
        "https://apps.apple.com/kr/app/kakao-t/id981110422"
      );
      return;
    }
    if (action === "papago") {
      safeOpen("papago://", "https://papago.naver.com");
      return;
    }
    if (action === "subway") {
      safeOpen(
        "jihachul://",
        "https://play.google.com/store/apps/details?id=com.imagedrome.jihachul",
        "https://apps.apple.com/kr/app/subway-korea/id325924444"
      );
      return;
    }
    if (action === "exchange") {
      openExternal("https://www.xe.com/currencyconverter/convert/?Amount=1&From=USD&To=KRW");
      return;
    }
    if (action === "phrases") {
      location.hash = "#phrases";
      return;
    }
    if (action === "safety") {
      window.App?.openEmergencySheet?.();
    }
  });
  homeRoot.querySelector("#btnAskKim")?.addEventListener("click", () => {
    location.hash = "#news";
    const start = Date.now();
    const poll = () => {
      const btn =
        document.querySelector('[data-filter="FAQ"]') ||
        Array.from(document.querySelectorAll("#page-korea-now button, #page-korea-now .chip"))
          .find((el) => (el.textContent || "").trim() === "FAQ");
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    };
    if (poll()) return;
    const timer = setInterval(() => {
      if (poll()) {
        clearInterval(timer);
        return;
      }
      if (Date.now() - start >= 3000) {
        clearInterval(timer);
      }
    }, 100);
  });
  homeRoot.querySelector(".spotlightGrid")?.addEventListener("click", (e) => {
    const card = e.target?.closest?.(".spotlightCard");
    if (!card) return;
    if (card.dataset.action === "kpop-now") {
      location.hash = "#kpop";
      setTimeout(() => {
        homeRoot
          .querySelector("#nowKpop")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  });

  const localToken = routeToken;
  loadNowPreview(localToken);
  loadCommunityPreview(localToken);
  if (!setupHome.nowPreviewBound) {
    setupHome.nowPreviewBound = true;
    window.addEventListener("koreaNow:updated", () => loadNowPreview(localToken));
    window.addEventListener("homePicks:updated", () => loadNowPreview());
    homeRoot.querySelector("#homeNowPreview")?.addEventListener("click", (e) => {
      const host = homeRoot.querySelector("#homeNowPreview");
      if (host?.dataset?.swiping === "1") return;
      const card = e.target?.closest?.(".previewCard");
      if (!card || card.dataset.placeholder === "1") return;
      const linkHash = card.dataset.linkHash || "";
      const source = card.dataset.source || "";
      const link = card.dataset.link || "";
      if (linkHash) {
        location.hash = linkHash;
        return;
      }
      if (source === "korea_now_posts" && link) {
        openExternal(link);
      }
    });
  }

  if (!setupHome.homePicksBound) {
    setupHome.homePicksBound = true;
    isAdminUser().then((ok) => {
      const btn = document.getElementById("btnEditHomePicks");
      if (btn) btn.style.display = ok ? "inline-flex" : "none";
    });
    homeRoot.querySelector("#btnEditHomePicks")?.addEventListener("click", () => {
      window.location.href = "/#home-picks-admin";
    });
  }

  // Enter key in input triggers analyze
  infoRoot.querySelector("#homeYoutubeUrl")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") analyzeHomeUrl();
  });

  loadHomeLibrary().then(() => {
    if (localToken !== window.App?.routeToken || !isHomeActive()) return;
    renderCollectionsSection();
  });
  initHeroAutoplay();
  startHomeCarousel();
}

function initHeroAutoplay() {
  const track = document.querySelector(".heroStrip__track");
  if (!track || track.dataset.autoplay === "1") return;
  track.dataset.autoplay = "1";

  const cards = [...track.querySelectorAll(".heroCard")];
  if (!cards.length) return;

  let i = 0;
  let intervalId = null;
  let resumeTimer = null;

  const tick = () => {
    const card = cards[i];
    if (!card) return;
    track.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
    i = (i + 1) % cards.length;
  };

  const startInterval = () => {
    clearInterval(intervalId);
    intervalId = setInterval(tick, 4000);
  };

  const pause = () => {
    clearInterval(intervalId);
  };

  const resume = () => {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      startInterval();
    }, 6000);
  };

  startInterval();

  const handleInteract = () => {
    pause();
    resume();
  };

  track.addEventListener("pointerdown", handleInteract, { passive: true });
  track.addEventListener("touchstart", handleInteract, { passive: true });
  track.addEventListener("wheel", handleInteract, { passive: true });
  track.addEventListener("scroll", handleInteract, { passive: true });
}

function getActiveRoute() {
  const raw = String(location.hash || "#home").replace("#", "");
  const route = raw.split("?")[0].trim().toLowerCase();
  return route || "home";
}

if (!setupHome.resumeBound) {
  setupHome.resumeBound = true;
  window.addEventListener("home:refresh", () => {
    const token = Number(window.App?.routeToken) || 0;
    setupHome(token);
  });
}

// Expose entrypoint for main.js
export {
  setupHome, analyzeHomeUrl, startHomeCarousel, stopHomeCarousel,
  renderHeroStripCards, HERO_CARDS_STATIC,
  startHeroStripAutoSlide, stopHeroStripAutoSlide,
};



