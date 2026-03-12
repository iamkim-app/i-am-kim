import {
  fetchKPosts,
  fetchIdolSpots,
  isAdmin,
  openKAdminModal,
  bindKAdminHandlers,
  deleteKPost,
} from "./korea_now.js";
import { safeOpen } from "./deeplinks.js";

const $ = (sel, root = document) => root.querySelector(sel);
const t = (k, vars) => (window.App?.t || ((k) => k))(k, vars);

const ADMIN_STATE = {
  checked: false,
  isAdmin: false,
};
const IDOL_STATE = {
  all: [],
  filtered: [],
  idol: "all",
  selected: new Set(),
};
let K_LOAD_TOKEN = 0;
let K_LOAD_TIMEOUT = null;
let K_LOADING = false;

function setKLoading(value) {
  K_LOADING = value;
  try {
    if (!window.App) window.App = {};
    window.App.kLoading = value;
  } catch {}
}

function ensureIdolSpotModal() {
  if (document.querySelector("#idolSpotModal")) return;
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "idolSpotModal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal__backdrop" data-close="1"></div>
    <div class="modal__card" role="dialog" aria-modal="true" aria-label="Idol spot details">
      <div class="modal__head">
        <div class="modal__title">Details</div>
        <button class="iconBtn" data-close="1" type="button" aria-label="Close"></button>
      </div>
      <div class="modal__body">
        <div class="idolSpot__title" id="idolSpotTitle"></div>
        <div class="idolSpot__badge" id="idolSpotIdol"></div>
        <div class="idolSpot__row" id="idolSpotAddrKo"></div>
        <div class="idolSpot__row" id="idolSpotAddrEn"></div>
        <div class="idolSpot__row" id="idolSpotHours"></div>
        <div class="idolSpot__row idolSpot__bg" id="idolSpotBg"></div>
        <div class="idolSpot__row idolSpot__tip" id="idolSpotTip"></div>
        <div class="idolSpot__actions">
          <button class="btn btn--primary btn--small" id="idolSpotOpenMap" type="button">Open map</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => {
    if (e.target?.closest?.("[data-close='1']")) modal.hidden = true;
  });
}

function openIdolSpotModal(spot) {
  ensureIdolSpotModal();
  const modal = document.querySelector("#idolSpotModal");
  if (!modal) return;
  const set = (id, value) => {
    const el = document.querySelector(id);
    if (el) el.textContent = value || "";
  };
  set("#idolSpotTitle", spot?.place_name || "");
  set("#idolSpotIdol", spot?.idol_name ? `Visited by ${spot.idol_name}` : "");
  set("#idolSpotAddrKo", spot?.korean_address || "");
  set("#idolSpotAddrEn", spot?.english_address || "");
  set("#idolSpotHours", spot?.opening_hours || "");
  set("#idolSpotBg", spot?.background || "");
  set("#idolSpotTip", spot?.foreigner_tip || "");
  const mapBtn = document.querySelector("#idolSpotOpenMap");
  if (mapBtn) {
    mapBtn.dataset.url = String(spot?.map_url || "");
    mapBtn.dataset.query = String(spot?.map_query || spot?.place_name || "");
    mapBtn.onclick = () => openIdolSpotMap(spot);
  }
  modal.hidden = false;
}

function openIdolSpotMap(spot) {
  const mapUrl = String(spot?.map_url || "").trim();
  const query = String(spot?.map_query || spot?.place_name || "").trim();
  if (query) {
    const q = encodeURIComponent(query);
    safeOpen(`nmap://search?query=${q}`, mapUrl, mapUrl);
    return;
  }
  if (mapUrl) window.open(mapUrl, "_blank");
}

function renderIdolSpots(spots) {
  const host = document.querySelector("#idol-hero-slider");
  if (!host) return;
  if (!spots.length) {
    host.innerHTML = `<div class="muted small">No idol spots yet.</div>`;
    return;
  }
  host.innerHTML = spots
    .map((spot) => {
      const name = escapeHtml(spot?.place_name || "Unknown place");
      const idol = escapeHtml(spot?.idol_name || "Idol");
      const idolLogoMap = {
        "Stray Kids": "/idol-logos/stray-kids.webp",
        TWICE: "/idol-logos/twice.webp",
        BTS: "/idol-logos/bts.webp",
        SEVENTEEN: "/idol-logos/seventeen.webp",
        BLACKPINK: "/idol-logos/blackpink.webp",
      };
      const idolLogo = idolLogoMap[spot?.idol_name] || "";
      const area = escapeHtml(spot?.area || "");
      const hours = escapeHtml(spot?.opening_hours || "");
      const bg = escapeHtml(spot?.background || "");
      const img = String(spot?.hero_image_url || "").trim();
      const mapUrl = escapeHtml(spot?.map_url || "");
      const bgStyle = img
        ? `style="background-image:url('${img}');"`
        : `style="background-image:linear-gradient(135deg, rgba(255,203,112,0.35), rgba(255,255,255,0.9));"`;
      const checked = IDOL_STATE.selected.has(spot.id) ? "checked" : "";
      return `
        <article class="kFoodHero__card" ${bgStyle}>
          ${idolLogo ? `<img class="kFoodHero__logo" src="${idolLogo}" alt="idol logo">` : ""}
          ${
            ADMIN_STATE.isAdmin
              ? `<label class="kFoodHero__select">
                   <input type="checkbox" data-id="${escapeHtml(spot.id)}" ${checked} />
                   <span>Select</span>
                 </label>`
              : ""
          }
          <div class="kFoodHero__tag">Visited by ${idol}</div>
          <div class="kFoodHero__name">${name}</div>
          <div class="kFoodHero__meta">${[area, hours].filter(Boolean).join(" • ")}</div>
          <div class="kFoodHero__meta kFoodHero__bg">${bg}</div>
          <div class="kFoodHero__actions">
            <button class="btn btn--ghost btn--small" type="button" data-action="map" data-url="${mapUrl}" data-query="${escapeHtml(spot?.map_query || spot?.place_name || "")}">Open map</button>
            <button class="btn btn--primary btn--small" type="button" data-action="details" data-index="${spot._index}">Details</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderIdolFilters(spots) {
  const host = document.querySelector("#idol-hero-filters");
  if (!host) return;
  const idols = Array.from(
    new Set((spots || []).map((s) => String(s?.idol_name || "").trim()).filter(Boolean))
  );
  const chips = ["All", ...idols];
  host.innerHTML = chips
    .map((label) => {
      const key = label === "All" ? "all" : label;
      const active = IDOL_STATE.idol === key ? "is-active" : "";
      return `<button class="chip chip--filter ${active}" type="button" data-idol="${escapeHtml(
        key
      )}">${escapeHtml(label)}</button>`;
    })
    .join("");
}

function ensureNearbyModal() {
  if (document.querySelector("#nearbyModal")) return;
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "nearbyModal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal__backdrop" data-close="1"></div>
    <div class="modal__card" role="dialog" aria-modal="true" aria-label="Place details">
      <div class="modal__head">
        <div class="modal__title" id="nearbyModalTitle">Details</div>
        <button class="iconBtn" data-close="1" type="button" aria-label="Close"></button>
      </div>
      <div class="modal__body">
        <div class="muted small" id="nearbyModalBody"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => {
    if (e.target?.closest?.("[data-close='1']")) modal.hidden = true;
  });
}

function openNearbyModal(place) {
  ensureNearbyModal();
  const modal = document.querySelector("#nearbyModal");
  const title = document.querySelector("#nearbyModalTitle");
  const body = document.querySelector("#nearbyModalBody");
  if (title) title.textContent = place?.name || "Details";
  if (body) {
    body.textContent = [
      place?.vicinity,
      place?.rating ? `Rating: ${place.rating}` : "",
      place?.openNow === true ? "Open now" : place?.openNow === false ? "Closed" : "",
    ]
      .filter(Boolean)
      .join(" • ");
  }
  if (modal) modal.hidden = false;
}

function buildPlaceMapUrl(place) {
  const name = String(place?.name || "").trim();
  const vicinity = String(place?.vicinity || "").trim();
  const query = encodeURIComponent([name, vicinity].filter(Boolean).join(" "));
  const pid = String(place?.placeId || "").trim();
  let url = `https://www.google.com/maps/search/?api=1&query=${query}`;
  if (pid) url += `&query_place_id=${encodeURIComponent(pid)}`;
  return url;
}

function renderNearbyResults(results) {
  const host = document.querySelector("#nearby-results");
  if (!host) return;
  if (!results.length) {
    host.innerHTML = `<div class="muted small">No nearby places found.</div>`;
    return;
  }
  host.innerHTML = results
    .map((p) => {
      const photo = p.photoRef
        ? `/api/places-photo?ref=${encodeURIComponent(p.photoRef)}&maxwidth=800`
        : "";
      const photoEl = photo
        ? `<div class="nearbyCard__photo">
            <img src="${photo}" alt="" loading="lazy" onerror="this.closest('.nearbyCard__photo').classList.add('is-empty'); this.remove();" />
          </div>`
        : `<div class="nearbyCard__photo is-empty"></div>`;
      const rating = p.rating ? `Rating ${p.rating}` : "No ratings";
      const openNow =
        p.openNow === true ? "Open now" : p.openNow === false ? "Closed" : "Hours unknown";
      return `
        <article class="card nearbyCard">
          ${photoEl}
          <div class="nearbyCard__body">
            <div class="nearbyCard__title">${escapeHtml(p.name || "Unknown")}</div>
            <div class="nearbyCard__meta">${escapeHtml(p.vicinity || "")}</div>
            <div class="nearbyCard__meta">${escapeHtml(rating)} • ${escapeHtml(openNow)}</div>
            <div class="nearbyCard__actions">
              <button class="btn btn--ghost btn--small" type="button" data-action="map" data-id="${escapeHtml(
                p.placeId || ""
              )}" data-name="${escapeHtml(p.name || "")}" data-vicinity="${escapeHtml(
                p.vicinity || ""
              )}">Open map</button>
              <button class="btn btn--primary btn--small" type="button" data-action="details" data-id="${escapeHtml(
                p.placeId || ""
              )}" data-name="${escapeHtml(p.name || "")}" data-vicinity="${escapeHtml(
                p.vicinity || ""
              )}" data-rating="${escapeHtml(p.rating ?? "")}" data-open="${escapeHtml(
                p.openNow ?? ""
              )}">Details</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

const TABS = [
  { id: "kpop",     tKey: "kpop_tab_kpop" },
  { id: "food",     tKey: "kpop_tab_food" },
  { id: "beauty",   tKey: "kpop_tab_beauty" },
  { id: "deals",    tKey: "kpop_tab_deals" },
  { id: "shopping", tKey: "kpop_tab_shopping" },
];
function getTabLabel(id) {
  const tab = TABS.find((tb) => tb.id === id);
  return tab ? t(tab.tKey) : id;
}
const TAB_DESCS = {
  kpop:     () => t("page_kpop_desc"),
  food:     () => t("kpop_desc_food"),
  beauty:   () => t("kpop_desc_beauty"),
  deals:    () => t("kpop_desc_deals"),
  shopping: () => t("kpop_desc_shopping"),
};

function ensureTabsUI(page) {
  if (!page || page.querySelector(".kSubtabs")) return;
  const header = page.querySelector(".pageHeader");
  if (header && !header.querySelector("#kTabLabel")) {
    const label = document.createElement("div");
    label.id = "kTabLabel";
    label.className = "muted small";
    header.insertBefore(label, header.querySelector(".pageHeader__desc") || null);
  }
  const bar = document.createElement("div");
  bar.className = "kSubtabs";
  bar.setAttribute("role", "tablist");
  bar.innerHTML =
    TABS.map(
      (tab) =>
        `<button class="btn btn--ghost btn--small kSubtab" type="button" role="tab" data-tab="${tab.id}">${t(tab.tKey)}</button>`
    ).join("") +
    `<button class="btn btn--primary btn--small kAdminAddBtn" type="button" style="display:none">${t("news_btn_add")}</button>`;
  if (header && header.nextSibling) {
    header.parentNode.insertBefore(bar, header.nextSibling);
  } else if (header) {
    header.parentNode.appendChild(bar);
  } else {
    page.insertBefore(bar, page.firstChild);
  }

  bar.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".kSubtab");
    if (!btn) return;
    const tab = btn.dataset.tab || "kpop";
    location.hash = `#k?tab=${tab}`;
  });
}

function ensureContentHost(page) {
  let host = page.querySelector("#kSubtabContent");
  if (host) return host;
  host = document.createElement("section");
  host.id = "kSubtabContent";
  host.className = "kSubtabContent";
  page.appendChild(host);
  return host;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderPosts(items, host, { isAdmin: canEdit = false, tab = "" } = {}) {
  if (!host) return;
  if (!items.length) {
    if (tab === "food") {
      renderPlaceholder(tab, host);
      return;
    }
    host.innerHTML = `<div class="muted small">No posts yet.</div>`;
    return;
  }
  host.innerHTML = `
    <section class="kSubtabPanel">
      ${items
        .map(
          (it) => `
            <article class="nowItemCard">
              <div class="nowItemCard__tag">${escapeHtml(it.tag || it.section || "")}</div>
              <div class="nowItemCard__title">${escapeHtml(it.title)}</div>
              <div class="nowItemCard__summary">${escapeHtml(it.summary)}</div>
              <div class="nowItemCard__actions">
                ${
                  it.link
                    ? `<a class="btn btn--ghost btn--small" href="${escapeHtml(it.link)}" target="_blank" rel="noreferrer">Open</a>`
                    : ""
                }
                ${
                  canEdit && it.id
                    ? `<button class="nowItemCard__delete" type="button" data-id="${escapeHtml(it.id)}">Delete</button>`
                    : ""
                }
              </div>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function renderPlaceholder(tab, host) {
  if (!host) return;
  if (tab === "food") {
    host.innerHTML = `
      <section class="kFoodHero">
        <div class="kFoodHero__head">
          <div>
            <div class="kFoodHero__title">Idol visited spots</div>
            <div class="kFoodHero__subtitle">Eat where your idol ate</div>
          </div>
        </div>

        <div class="kFoodHero__chips" id="idol-hero-filters"></div>
        <div class="kFoodHero__track" id="idol-hero-slider"></div>
        <div class="kFoodHero__dots" aria-hidden="true">
          <span class="dot is-active"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </section>
      <section class="card kSubtabPanel">
        <h3 class="card__title">K-FOOD</h3>
        <button class="btn btn--primary btn--small" id="btnNearbyLocation" type="button">Use my location</button>
        <div class="muted small" style="margin-top:8px;">Coming next: nearby restaurants</div>
        <div class="nearbyResults" id="nearby-results"></div>
      </section>
    `;
    const dots = host.querySelector(".kFoodHero__dots");
    if (dots) dots.hidden = true;
    fetchIdolSpots().then((spots) => {
      const withIndex = (spots || []).map((s, idx) => ({ ...s, _index: idx }));
      IDOL_STATE.all = withIndex;
      IDOL_STATE.idol = "all";
      IDOL_STATE.filtered = withIndex;
      IDOL_STATE.selected = new Set();
      renderIdolFilters(withIndex);
      renderIdolSpots(withIndex);
      if (dots) dots.hidden = !(spots && spots.length > 1);
    });
    const slider = host.querySelector("#idol-hero-slider");
    if (slider && slider.dataset.bound !== "1") {
      slider.dataset.bound = "1";
      slider.addEventListener("click", (e) => {
        const checkbox = e.target?.closest?.("input[type='checkbox'][data-id]");
        if (checkbox) {
          const id = checkbox.dataset.id;
          if (checkbox.checked) {
            IDOL_STATE.selected.add(id);
          } else {
            IDOL_STATE.selected.delete(id);
          }
          return;
        }
        const btn = e.target?.closest?.("button[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === "map") {
          const url = btn.dataset.url || "";
          const query = btn.dataset.query || "";
          if (query) {
            safeOpen(`nmap://search?query=${encodeURIComponent(query)}`, url, url);
            return;
          }
          if (url) window.open(url, "_blank");
          return;
        }
        if (action === "details") {
          const idx = Number(btn.dataset.index);
          const spot = Number.isFinite(idx) ? IDOL_STATE.filtered[idx] : null;
          if (spot) openIdolSpotModal(spot);
        }
      });
    }
    const filters = host.querySelector("#idol-hero-filters");
    if (filters && filters.dataset.bound !== "1") {
      filters.dataset.bound = "1";
      filters.addEventListener("click", (e) => {
        const chip = e.target?.closest?.(".chip");
        if (!chip) return;
        const idol = chip.dataset.idol || "all";
        IDOL_STATE.idol = idol;
        const next =
          idol === "all"
            ? IDOL_STATE.all
            : IDOL_STATE.all.filter((s) => String(s?.idol_name || "") === idol);
        IDOL_STATE.filtered = next;
        renderIdolFilters(IDOL_STATE.all);
        renderIdolSpots(next);
        if (dots) dots.hidden = !(next && next.length > 1);
      });
    }
    const nearbyBtn = host.querySelector("#btnNearbyLocation");
    const nearbyHost = host.querySelector("#nearby-results");
    if (nearbyBtn && nearbyHost && nearbyBtn.dataset.bound !== "1") {
      nearbyBtn.dataset.bound = "1";
      nearbyBtn.addEventListener("click", async () => {
        nearbyHost.innerHTML = `<div class="muted small">Locating...</div>`;
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const keyword = "";
            const radii = [1500, 3000, 5000];
            try {
              let results = [];
              for (const radius of radii) {
                const qs = new URLSearchParams({
                  lat: String(lat),
                  lng: String(lng),
                  radius: String(radius),
                  type: "restaurant",
                  ...(keyword ? { keyword } : {}),
                });
                const resp = await fetch(`/api/places-nearby?${qs.toString()}`, {
                  cache: "no-store",
                });
                if (!resp.ok) {
                  nearbyHost.innerHTML = `<div class="muted small">Failed to load nearby places.</div>`;
                  return;
                }
                const data = await resp.json();
                if (data?.ok === false) {
                  nearbyHost.innerHTML = `<div class="muted small">Failed to load nearby places.</div>`;
                  return;
                }
                results = data?.results || [];
                if (results.length) break;
              }
              renderNearbyResults(results);
            } catch (err) {
              nearbyHost.innerHTML = `<div class="muted small">Failed to load nearby places.</div>`;
            }
          },
          () => {
            nearbyHost.innerHTML = `<div class="muted small">Location unavailable.</div>`;
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
        );
      });
      nearbyHost.addEventListener("click", (e) => {
        const btn = e.target?.closest?.("button[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        const place = {
          placeId: btn.dataset.id || "",
          name: btn.dataset.name || "",
          vicinity: btn.dataset.vicinity || "",
          rating: btn.dataset.rating || "",
          openNow: btn.dataset.open === "true" ? true : btn.dataset.open === "false" ? false : null,
        };
        if (action === "map") {
          window.open(buildPlaceMapUrl(place), "_blank");
          return;
        }
        if (action === "details") {
          openNearbyModal(place);
        }
      });
    }
    
    return;
  }

  host.innerHTML = `
    <section class="card kSubtabPanel">
      <h3 class="card__title">Coming soon</h3>
      <div class="muted small">This section is being prepared.</div>
    </section>
  `;
}

export async function initKPage({ tab = "kpop" } = {}) {
  const page = $("#page-kpop");
  if (!page) return;
  ensureTabsUI(page);

  if (!ADMIN_STATE.checked) {
    ADMIN_STATE.isAdmin = await isAdmin();
    ADMIN_STATE.checked = true;
  }

  const tabLabel = page.querySelector("#kTabLabel");
  if (tabLabel) tabLabel.textContent = getTabLabel(tab);
  const desc = page.querySelector(".pageHeader__desc");
  if (desc) desc.textContent = (TAB_DESCS[tab] || TAB_DESCS.kpop)();

  const buttons = page.querySelectorAll(".kSubtab");
  buttons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });

  const addBtn = page.querySelector(".kAdminAddBtn");
  if (addBtn) {
    addBtn.style.display = ADMIN_STATE.isAdmin && tab !== "kpop" ? "inline-flex" : "none";
    addBtn.dataset.tab = tab;
    if (ADMIN_STATE.isAdmin && addBtn.dataset.bound !== "1") {
      addBtn.dataset.bound = "1";
      addBtn.addEventListener("click", () => openKAdminModal(addBtn.dataset.tab || "kpop"));
    }
  }

  const kpopSection = page.querySelector("#nowKpop");
  const host = ensureContentHost(page);
  const isVisible = () => page && !page.hidden;
  const clearLoadTimeout = () => {
    if (K_LOAD_TIMEOUT) clearTimeout(K_LOAD_TIMEOUT);
    K_LOAD_TIMEOUT = null;
  };
  const showRetry = (loadFn) => {
    if (!isVisible()) return;
    host.innerHTML = `Still loading. <button class="btn btn--ghost btn--small" type="button" data-retry="k-tab">Retry</button>`;
    const btn = host.querySelector('button[data-retry="k-tab"]');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        clearLoadTimeout();
        setKLoading(false);
        host.innerHTML = "";
        loadTab();
      });
    }
  };
  const loadTab = async () => {
    const requestId = ++K_LOAD_TOKEN;
    clearLoadTimeout();
    setKLoading(true);
    host.innerHTML = "";
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      if (isVisible()) {
        host.innerHTML = `<div class="muted small">You are offline. Connect to the internet to load updates.</div>`;
      }
      setKLoading(false);
      return;
    }
    host.innerHTML = `<div class="muted small">Loading...</div>`;
    K_LOAD_TIMEOUT = setTimeout(() => {
      if (requestId !== K_LOAD_TOKEN) return;
      K_LOAD_TOKEN += 1;
      clearLoadTimeout();
      setKLoading(false);
      showRetry(loadTab);
    }, 8000);
    try {
      const items = await fetchKPosts(tab);
      if (requestId !== K_LOAD_TOKEN) return;
      renderPosts(items, host, { isAdmin: ADMIN_STATE.isAdmin, tab });
    } catch {
      if (requestId !== K_LOAD_TOKEN) return;
      clearLoadTimeout();
      setKLoading(false);
      showRetry(loadTab);
    } finally {
      if (requestId === K_LOAD_TOKEN) {
        clearLoadTimeout();
        setKLoading(false);
      }
    }
  };
  const refreshTab = async () => loadTab();

  if (tab === "kpop") {
    if (kpopSection) kpopSection.hidden = false;
    host.hidden = true;
    host.innerHTML = "";
    clearLoadTimeout();
    setKLoading(false);
    return;
  }

  if (kpopSection) kpopSection.hidden = true;
  host.hidden = false;
  await loadTab();

  if (ADMIN_STATE.isAdmin) {
    bindKAdminHandlers(refreshTab);
    if (host.dataset.bound !== "1") {
      host.dataset.bound = "1";
      host.addEventListener("click", async (e) => {
        const delBtn = e.target?.closest?.(".nowItemCard__delete");
        if (!delBtn) return;
        const id = delBtn.dataset.id || "";
        if (!id) return;
        const ok = await deleteKPost(id);
        if (ok) await refreshTab();
      });
    }
  }
}

function getActiveRouteAndTab() {
  const raw = String(location.hash || "#home").replace("#", "");
  const [routePart, queryPart] = raw.split("?");
  const route = (routePart || "").trim().toLowerCase() || "home";
  const params = new URLSearchParams(queryPart || "");
  const tab = String(params.get("tab") || "").trim().toLowerCase();
  return { route, tab };
}

if (!initKPage.resumeBound) {
  initKPage.resumeBound = true;

  window.addEventListener("k:refresh", () => {
    const { route, tab } = getActiveRouteAndTab();
    if (route !== "k" && route !== "kpop") return;
    setKLoading(false);
    initKPage({ tab: tab || "kpop" });
  });
}
