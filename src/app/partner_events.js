// partner_events.js — Partner event hero cards + detail sheet

const getApp = () => window.App || {};
const t = (k, vars) => (getApp().t || ((k) => k))(k, vars);

let PARTNER_EVENTS_CACHE = null;
let PARTNER_SLIDER_INDEX = 0;

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchActivePartnerEvents() {
  if (PARTNER_EVENTS_CACHE !== null) return PARTNER_EVENTS_CACHE;
  const { supabase } = getApp();
  if (!supabase) return [];

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("partner_events")
    .select("*")
    .eq("is_active", true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[partner_events] fetch failed", error);
    return [];
  }
  PARTNER_EVENTS_CACHE = data || [];
  return PARTNER_EVENTS_CACHE;
}

export function clearPartnerEventsCache() {
  PARTNER_EVENTS_CACHE = null;
}

// ── Hero Cards Injection ──────────────────────────────────────────────────────

export async function initPartnerEvents() {
  ensurePartnerEventSheet();

  const { renderHeroStripCards, HERO_CARDS_STATIC, startHeroStripAutoSlide } = getApp();

  // If home.js hasn't exported these yet, bail — setupHome hasn't run.
  if (!renderHeroStripCards || !HERO_CARDS_STATIC) return;

  const events = await fetchActivePartnerEvents();

  if (!events.length) {
    // No partner events — static strip is already rendered; just ensure auto-slide is running.
    startHeroStripAutoSlide?.();
    return;
  }

  // Convert partner events to card descriptors
  const partnerCards = events.map((ev) => ({
    partner: true,
    badge: "PARTNER",
    title: ev.title || "",
    img: Array.isArray(ev.images) && ev.images[0] ? ev.images[0] : "",
    gradient: "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)",
    onClick: () => openPartnerEventSheet(ev),
  }));

  // Merge: static[0] → partner cards → static[1..]
  const merged = [
    HERO_CARDS_STATIC[0],
    ...partnerCards,
    ...HERO_CARDS_STATIC.slice(1),
  ];

  // Single render pass — replaces the entire track content
  renderHeroStripCards(merged);

  // Restart auto-slide with the updated card count
  startHeroStripAutoSlide?.();
}

// ── Sheet DOM ─────────────────────────────────────────────────────────────────

function ensurePartnerEventSheet() {
  if (document.getElementById("partnerEventSheet")) return;

  const el = document.createElement("div");
  el.id = "partnerEventSheet";
  el.className = "partnerEventModal";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.innerHTML = `
    <div class="partnerEventModal__backdrop"></div>
    <div class="partnerEventModal__card">
      <div id="partnerImgSlider" class="partnerImgSlider">
        <div class="partnerImgSlider__track" id="partnerImgTrack"></div>
        <div class="partnerImgSlider__dots" id="partnerImgDots"></div>
      </div>

      <div class="partnerEventModal__body">
        <div class="partnerEventModal__header">
          <span class="partnerEventModal__badge">PARTNER</span>
          <button class="partnerEventModal__close" id="btnClosePartnerSheet" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                 stroke-linecap="round" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <h2 class="partnerEventModal__title" id="partnerEventTitle"></h2>
        <p  class="partnerEventModal__subtitle" id="partnerEventSubtitle"></p>
        <p  class="partnerEventModal__desc" id="partnerEventDesc"></p>
        <div class="partnerEventModal__expiry" id="partnerEventExpiry" hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" width="13" height="13">
            <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
          </svg>
          <span id="partnerEventExpiryText"></span>
        </div>
      </div>

      <div class="partnerActionBar" id="partnerActionBar">
        <button class="partnerActionBar__map" id="btnPartnerNaverMap" hidden>
          Find on Naver Map
        </button>
        <button class="partnerActionBar__coupon" id="btnPartnerShowScreen" hidden>
          Show this screen
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(el);

  el.querySelector(".partnerEventModal__backdrop")
    .addEventListener("click", closePartnerEventSheet);
  document.getElementById("btnClosePartnerSheet")
    .addEventListener("click", closePartnerEventSheet);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePartnerEventSheet();
  });
}

// ── Open / Close ──────────────────────────────────────────────────────────────

export function openPartnerEventSheet(ev) {
  ensurePartnerEventSheet();
  const sheet = document.getElementById("partnerEventSheet");
  if (!sheet) return;

  // Title / subtitle / description
  document.getElementById("partnerEventTitle").textContent = ev.title || "";
  const subtitleEl = document.getElementById("partnerEventSubtitle");
  subtitleEl.textContent = ev.subtitle || "";
  subtitleEl.hidden = !ev.subtitle;

  const descEl = document.getElementById("partnerEventDesc");
  descEl.textContent = ev.description || "";
  descEl.hidden = !ev.description;

  // Expiry
  const expiryEl = document.getElementById("partnerEventExpiry");
  const expiryText = document.getElementById("partnerEventExpiryText");
  if (ev.expires_at) {
    const d = new Date(ev.expires_at);
    expiryText.textContent = `Valid until ${d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`;
    expiryEl.hidden = false;
  } else {
    expiryEl.hidden = true;
  }

  // Images
  const images = Array.isArray(ev.images) ? ev.images.filter(Boolean) : [];
  renderPartnerImageSlider(images);

  // Action buttons
  const btnMap = document.getElementById("btnPartnerNaverMap");
  const btnCoupon = document.getElementById("btnPartnerShowScreen");

  if (ev.naver_map_url) {
    btnMap.hidden = false;
    btnMap.onclick = () => {
      const url = ev.naver_map_url;
      const { openDeepLink } = getApp();
      if (openDeepLink) {
        openDeepLink(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    };
  } else {
    btnMap.hidden = true;
    btnMap.onclick = null;
  }

  if (ev.coupon_code) {
    btnCoupon.hidden = false;
    btnCoupon.onclick = () => openCouponPopup(ev.coupon_code, ev.title || "");
  } else {
    btnCoupon.hidden = true;
  }

  const actionBar = document.getElementById("partnerActionBar");
  actionBar.hidden = !ev.naver_map_url && !ev.coupon_code;

  sheet.hidden = false;
  document.body.style.overflow = "hidden";
  document.getElementById("btnClosePartnerSheet")?.focus();
}

export function closePartnerEventSheet() {
  const sheet = document.getElementById("partnerEventSheet");
  if (sheet) sheet.hidden = true;
  document.body.style.overflow = "";
}

// ── Coupon Popup ──────────────────────────────────────────────────────────────

function ensureCouponPopup() {
  if (document.getElementById("partnerCouponPopup")) return;
  const el = document.createElement("div");
  el.id = "partnerCouponPopup";
  el.className = "couponPopup";
  el.hidden = true;
  el.innerHTML = `
    <div class="couponPopup__backdrop"></div>
    <div class="couponPopup__card">
      <div class="couponPopup__label">Show this screen at the store</div>
      <div class="couponPopup__event" id="couponPopupEvent"></div>
      <div class="couponPopup__codeBox">
        <div class="couponPopup__codeLabel">Coupon Code</div>
        <div class="couponPopup__code" id="couponPopupCode"></div>
        <button class="couponPopup__copy" id="btnCouponCopy" type="button">Copy code</button>
      </div>
      <button class="couponPopup__close" id="btnCouponClose" type="button">Done</button>
    </div>
  `;
  document.body.appendChild(el);

  el.querySelector(".couponPopup__backdrop")
    .addEventListener("click", closeCouponPopup);
  document.getElementById("btnCouponClose")
    .addEventListener("click", closeCouponPopup);
  document.getElementById("btnCouponCopy")
    .addEventListener("click", () => {
      const code = document.getElementById("couponPopupCode")?.textContent || "";
      navigator.clipboard?.writeText(code).then(() => {
        const btn = document.getElementById("btnCouponCopy");
        if (btn) {
          btn.textContent = "Copied!";
          setTimeout(() => { btn.textContent = "Copy code"; }, 2000);
        }
      }).catch(() => {});
    });
}

function openCouponPopup(code, eventTitle) {
  ensureCouponPopup();
  document.getElementById("couponPopupCode").textContent = code;
  document.getElementById("couponPopupEvent").textContent = eventTitle;
  document.getElementById("partnerCouponPopup").hidden = false;
}

function closeCouponPopup() {
  const popup = document.getElementById("partnerCouponPopup");
  if (popup) popup.hidden = true;
}

// ── Image Slider ──────────────────────────────────────────────────────────────

function renderPartnerImageSlider(images) {
  const track = document.getElementById("partnerImgTrack");
  const dotsEl = document.getElementById("partnerImgDots");
  const sliderEl = document.getElementById("partnerImgSlider");
  if (!track || !dotsEl || !sliderEl) return;

  PARTNER_SLIDER_INDEX = 0;

  if (!images.length) {
    sliderEl.hidden = true;
    return;
  }

  sliderEl.hidden = false;
  track.style.transform = "";
  track.innerHTML = images
    .map(
      (url) =>
        `<img class="partnerImgSlider__img" src="${esc(url)}" alt="" loading="lazy" />`
    )
    .join("");

  if (images.length > 1) {
    dotsEl.innerHTML = images
      .map(
        (_, i) =>
          `<button class="partnerImgSlider__dot${i === 0 ? " is-active" : ""}"
            data-index="${i}" aria-label="Image ${i + 1}"></button>`
      )
      .join("");
  } else {
    dotsEl.innerHTML = "";
  }

  // Remove old listeners by replacing the element clone
  const newSlider = sliderEl.cloneNode(true);
  sliderEl.replaceWith(newSlider);

  // Re-query after replacement
  const newTrack = document.getElementById("partnerImgTrack");
  const newDots = document.getElementById("partnerImgDots");

  if (images.length <= 1) return;

  newDots.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-index]");
    if (!btn) return;
    setPartnerSliderIndex(parseInt(btn.dataset.index, 10), images.length);
  });

  let startX = 0;
  newTrack.parentElement.addEventListener(
    "touchstart",
    (e) => {
      startX = e.touches[0].clientX;
    },
    { passive: true }
  );
  newTrack.parentElement.addEventListener(
    "touchend",
    (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) {
        setPartnerSliderIndex(
          PARTNER_SLIDER_INDEX + (dx < 0 ? 1 : -1),
          images.length
        );
      }
    },
    { passive: true }
  );
}

function setPartnerSliderIndex(idx, total) {
  PARTNER_SLIDER_INDEX = Math.min(Math.max(idx, 0), total - 1);
  const track = document.getElementById("partnerImgTrack");
  const dotsEl = document.getElementById("partnerImgDots");
  if (track)
    track.style.transform = `translateX(${-PARTNER_SLIDER_INDEX * 100}%)`;
  dotsEl?.querySelectorAll(".partnerImgSlider__dot").forEach((d, i) => {
    d.classList.toggle("is-active", i === PARTNER_SLIDER_INDEX);
  });
}
