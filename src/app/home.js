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

  const input = $("#homeYoutubeUrl");
  const raw = (input?.value || "").trim();

  if (!raw) {
    setWatchStatus("Paste a YouTube link first.");
    setHomeLoading(false);
    return;
  }

  const url = normalizeYoutubeUrl(raw);

  // render player immediately
  renderVideoPlayer(url, 0, false);

  // require backend origin for native shell
  if (isNativeShell && isNativeShell() && !getBackendOrigin()) {
    setWatchStatus("Set your backend URL in About -> Backend base URL.");
    setHomeLoading(false);
    return;
  }

  // require login
  const token = await getAccessToken?.();
  if (!token) {
    setWatchStatus("Please sign in to use the free analysis.");
    setHomeLoading(false);
    return;
  }

  setWatchStatus("Extracting travel tips...");

  try {
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
      setHomeLoading(false);
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
  setText("#watchTldr", "No summary yet. Extract a video to get a quick skim.");
  $("#watchMustKnows") && ($("#watchMustKnows").innerHTML = "");
  $("#watchPlacesFoods") && ($("#watchPlacesFoods").innerHTML = "");
  $("#watchMoments") && ($("#watchMoments").innerHTML = "");
  $("#watchMore") && ($("#watchMore").style.display = "none");
  $("#watchFull") && ($("#watchFull").textContent = "");
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
      location.hash = "#home";
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
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

function renderHomeLayout() {
  const page = $("#page-home");
  if (!page) return;
  page.innerHTML = `
    <section class="homeSection homeSection--hero">
      <div class="homeHero">
        <div class="homeHero__title">Travel Korea. Instantly.</div>
        <div class="homeHero__subtitle">Paste a YouTube link and get travel-only tips with tappable timestamps.</div>
        <div class="homeHero__cta">Start with a link or explore quick actions below.</div>
      </div>

      <div class="analyzeBox" id="analyzeBox">
        <div class="analyzeBox__head">
          <div class="analyzeBox__title">Play and Extract</div>
          <div class="analyzeBox__desc">Travel-only tips. No fluff.</div>
        </div>
        <div class="analyzeRow">
          <input id="homeYoutubeUrl" class="input input--xl" placeholder="Paste a YouTube link (https://youtu.be/...)" autocomplete="off" />
          <button class="btn btn--primary btn--xl" id="btnHomeAnalyze" type="button">Play & Extract</button>
          <button class="btn btn--ghost btn--xl" id="btnHomeClear" type="button">Clear</button>
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
          <div class="resultsTitle">Quick skim</div>
          <div class="resultsBody" id="watchTldr"></div>
          <div class="muted small" id="watchSkimStatus">Paste a link to generate insights.</div>
          <div class="callout" id="watchAuthHint" style="display:none">Sign in to unlock the free analysis.</div>
          <details class="details" id="watchMore" style="display:none">
            <summary>See full summary</summary>
            <div class="output" id="watchFull"></div>
          </details>
        </div>
        <div class="resultsCard">
          <div class="resultsTitle">Traveler must-knows</div>
          <ul class="bullets bullets--tight" id="watchMustKnows"></ul>
          <div class="resultsTitle">Key moments (tap to jump)</div>
          <div class="moments" id="watchMoments"></div>
          <div class="resultsTitle">Places and foods</div>
          <ul class="bullets bullets--tight" id="watchPlacesFoods"></ul>
        </div>
      </div>
    </section>

    <section class="homeSection">
      <div class="sectionHead">
        <div class="sectionTitle">Quick actions</div>
        <div class="sectionDesc">Jump to essentials for your trip.</div>
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
      </div>
    </section>

    <section class="homeSection">
      <div class="sectionHead">
      <div class="sectionTitle">Concert &amp; fan</div>
      <div class="sectionDesc">K-POP essentials for live shows and fan spots.</div>
      </div>
      <div class="spotlightGrid">
        <button class="spotlightCard" type="button" data-action="kpop-now">
          <div class="spotlightTitle">K-POP Concerts &amp; Fan Spots</div>
          <div class="spotlightDesc">Entry rules, bag policy, arrival timing.</div>
        </button>
        <button class="spotlightCard" type="button" data-action="kpop-now">
          <div class="spotlightTitle">Merch &amp; VIP etiquette</div>
          <div class="spotlightDesc">Queueing, photos, respectful behavior.</div>
        </button>
        <button class="spotlightCard" type="button" data-action="kpop-now">
          <div class="spotlightTitle">K-POP Stars</div>
          <div class="spotlightDesc">Studios, cafés, iconic photo spots.</div>
        </button>
      </div>
    </section>

    <section class="homeSection">
      <div class="sectionHead">
        <div class="sectionTitle">Korea Now</div>
        <div class="sectionDesc">Latest travel notes and quick alerts.</div>
      </div>
      <div class="previewGrid" id="homeNowPreview">
        <div class="previewCard">
          <div class="previewTag">Essentials</div>
          <div class="previewTitle">Arrival checklist</div>
          <div class="previewDesc">SIM, T-money, and airport transit tips.</div>
        </div>
        <div class="previewCard">
          <div class="previewTag">Trending</div>
          <div class="previewTitle">Seasonal hotspots</div>
          <div class="previewDesc">Popular areas and crowd windows this week.</div>
        </div>
        <div class="previewCard">
          <div class="previewTag">Advisory</div>
          <div class="previewTitle">Transit changes</div>
          <div class="previewDesc">Temporary line closures and bus reroutes.</div>
        </div>
      </div>
    </section>\n<section class="homeSection" id="home-library">
      <div class="sectionHead">
        <div class="sectionTitle">Curated library</div>
        <div class="sectionDesc">Explore videos by theme.</div>
      </div>
      <div id="homeCollections" class="collectionsWrap"></div>
    </section>

  `;
}

function getApp() {
  return window.App || {};
}

function isStandaloneMode() {
  try {
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) {
      return true;
    }
    return window.navigator && window.navigator.standalone === true;
  } catch {
    return false;
  }
}

function openUrl(url) {
  const target = String(url || "").trim();
  if (!target) return;
  if (isStandaloneMode()) {
    location.href = target;
    return;
  }
  window.open(target, "_blank", "noopener");
}

async function loadNowPreview() {
  const host = document.getElementById("homeNowPreview");
  if (!host) return;

  const supabase = getApp().supabase;
  let items = [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("korea_now_posts")
        .select("section,tag,title,summary,link,created_at,status")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      items = (data || []).map((row) => ({
        tag: row.tag || row.section || "Update",
        title: row.title || "Untitled",
        summary: row.summary || "",
        link: row.link || "",
      }));
    } catch (err) {
      console.warn("[home] Korea Now preview failed.", err);
    }
  }

  if (!items.length) {
    host.innerHTML = `
      <div class="previewCard">
        <div class="previewTag">Essentials</div>
        <div class="previewTitle">Arrival checklist</div>
        <div class="previewDesc">SIM, T-money, and airport transit tips.</div>
      </div>
      <div class="previewCard">
        <div class="previewTag">Trending</div>
        <div class="previewTitle">Seasonal hotspots</div>
        <div class="previewDesc">Popular areas and crowd windows this week.</div>
      </div>
      <div class="previewCard">
        <div class="previewTag">Advisory</div>
        <div class="previewTitle">Transit changes</div>
        <div class="previewDesc">Temporary line closures and bus reroutes.</div>
      </div>
    `;
    return;
  }

  host.innerHTML = items
    .map(
      (it) => `
      <button class="previewCard" type="button" data-link="${escapeHtml(it.link)}">
        <div class="previewTag">${escapeHtml(it.tag)}</div>
        <div class="previewTitle">${escapeHtml(it.title)}</div>
        <div class="previewDesc">${escapeHtml(it.summary)}</div>
      </button>
    `
    )
    .join("");
}

function setupHome() {
  renderHomeLayout();
  clearHome();

  $("#btnHomeAnalyze")?.addEventListener("click", analyzeHomeUrl);
  $("#btnHomeClear")?.addEventListener("click", clearHome);
  $("#btnGoLibrary")?.addEventListener("click", async () => {
    if (location.hash !== "#home") location.hash = "#home";
    if (!HOME_LIBRARY_COLLECTIONS.length) {
      await loadHomeLibrary();
      renderCollectionsSection();
    }
    const target = document.getElementById("homeCollections");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $(".quickActions")?.addEventListener("click", (e) => {
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
      window.location.href =
        "https://www.xe.com/currencyconverter/convert/?Amount=1&From=USD&To=KRW";
      return;
    }
    if (action === "safety") {
      window.App?.openEmergencySheet?.();
    }
  });
  $(".spotlightGrid")?.addEventListener("click", (e) => {
    const card = e.target?.closest?.(".spotlightCard");
    if (!card) return;
    if (card.dataset.action === "kpop-now") {
      location.hash = "#now";
      setTimeout(() => {
        document
          .getElementById("nowKpop")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  });

  loadNowPreview();
  if (!setupHome.nowPreviewBound) {
    setupHome.nowPreviewBound = true;
    window.addEventListener("koreaNow:updated", () => loadNowPreview());
    document.getElementById("homeNowPreview")?.addEventListener("click", (e) => {
      const card = e.target?.closest?.(".previewCard");
      if (!card) return;
      const link = card.dataset.link || "";
      if (link) openUrl(link);
    });
  }

  // Enter key in input triggers analyze
  $("#homeYoutubeUrl")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") analyzeHomeUrl();
  });

  loadHomeLibrary().then(() => {
    renderCollectionsSection();
  });
}

// Expose entrypoint for main.js
export { setupHome, analyzeHomeUrl };

