const SEED_ITEMS = [
  {
    id: "kp-1",
    title: "Concert prep essentials",
    category: "K-POP",
    summary: "ID check, ticket rules, bag policy, and arrival timing.",
    cta: { label: "Concert prep tips", url: "#korea-now" },
  },
  {
    id: "kp-2",
    title: "Merch & VIP etiquette",
    category: "K-POP",
    summary: "Queue rules, photo zones, and respectful fan behavior.",
    cta: { label: "Merch/VIP etiquette", url: "#korea-now" },
  },
  {
    id: "kp-3",
    title: "K-POP Stars",
    category: "K-POP",
    summary: "Studios, cafes, and iconic photo spots.",
    cta: { label: "K-POP Stars", url: "#korea-now" },
  },
  {
    id: "dl-1",
    title: "Best transit day passes",
    category: "Deals",
    summary: "Where to buy and which pass fits your route.",
    cta: { label: "See deals", url: "#korea-now" },
  },
  {
    id: "ev-1",
    title: "Weekend festivals",
    category: "Deals",
    summary: "Pop-ups and outdoor events around Seoul.",
    cta: { label: "View events", url: "#korea-now" },
  },
  {
    id: "tr-1",
    title: "Late-night transit",
    category: "Travel Tips",
    summary: "Night buses, last train times, and taxi tips.",
    cta: { label: "Transit updates", url: "#korea-now" },
  },
  {
    id: "sf-1",
    title: "Safety hotline basics",
    category: "Major Issues",
    summary: "Emergency numbers and what to say.",
    cta: { label: "Safety tips", url: "#korea-now" },
  },
];

const FILTERS = ["Major Issues", "Travel Tips", "Trends", "Deals"];
const SECTION_LABELS = {
  "Major Issues": "Major Issues",
  "Travel Tips": "Travel Tips",
  Trends: "Trends",
  Deals: "Deals",
  "K-POP Now": "K-POP Now",
};

function $(sel) {
  return document.querySelector(sel);
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const NOW_STATE = {
  items: [],
  isAdmin: false,
  mode: "mykorea",
  refresh: null,
};

function getApp() {
  return window.App || {};
}

function getSupabase() {
  return getApp().supabase;
}

function normalizeSection(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return "";
  if (v.includes("major")) return "Major Issues";
  if (v.includes("travel")) return "Travel Tips";
  if (v.includes("trend")) return "Trends";
  if (v.includes("deal")) return "Deals";
  if (v.includes("k-pop") || v.includes("kpop")) return "K-POP Now";
  return "";
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
  const raw = String(url || "").trim();
  if (!raw) return;
  const normalized = raw.startsWith("http") ? raw : `https://${raw}`;
  window.open(normalized, "_blank");
}

function renderChips(active) {
  const host = $("#nowChips");
  if (!host) return;
  host.innerHTML = FILTERS.map((label) => {
    const isActive = label === active;
    return `
      <button class="chip chip--filter ${isActive ? "is-active" : ""}" data-filter="${label}" type="button">
        ${label}
      </button>
    `;
  }).join("");
}

function renderCard(it, canDelete) {
  const tag = it.tag || it.section || "";
  const link = it.link || "";
  const openBtn = link
    ? `<button class="nowItemCard__cta" type="button" data-link="${escapeHtml(link)}">Open</button>`
    : "";
  const deleteBtn =
    canDelete && it.id
      ? `<button class="nowItemCard__delete" type="button" data-id="${escapeHtml(
          it.id
        )}">Delete</button>`
      : "";
  return `
      <article class="nowItemCard">
        <div class="nowItemCard__tag">${escapeHtml(tag)}</div>
        <div class="nowItemCard__title">${escapeHtml(it.title)}</div>
        <div class="nowItemCard__summary">${escapeHtml(it.summary)}</div>
        <div class="nowItemCard__actions">
          ${openBtn}
          ${deleteBtn}
        </div>
      </article>
    `;
}

function renderCards(active, items) {
  const host = $("#nowCards");
  if (!host) return;
  const list = items.filter((it) => it.section === active);
  host.innerHTML = list.length
    ? list
        .map((it) => renderCard(it, NOW_STATE.isAdmin && it.canDelete))
        .join("")
    : `<div class="muted small">No items yet.</div>`;
}

function renderKpop(items) {
  const host = $("#nowCardsKpop");
  if (!host) return;
  const list = items.filter((it) => it.section === "K-POP Now");
  host.innerHTML = list.length
    ? list
        .map((it) => renderCard(it, NOW_STATE.isAdmin && it.canDelete))
        .join("")
    : `<div class="muted small">No K-POP updates yet.</div>`;
}

function bindChips(active, items) {
  $("#nowChips")?.querySelectorAll(".chip--filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.filter || active;
      renderChips(next);
      renderCards(next, items);
      bindChips(next, items);
    });
  });
}

async function loadFallbackItems(mode) {
  const items = [];
  try {
    const res = await fetch("/data/korea_now.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Fallback JSON failed");
    const data = await res.json();
    const mapSection = (section, arr) => {
      (arr || []).forEach((it, idx) => {
        items.push({
          id: `${section}-${idx}`,
          section,
          tag: it.tag || section,
          title: it.title || "Untitled",
          summary: it.desc || "",
          link: it.link || "",
          canDelete: false,
        });
      });
    };
    mapSection("Travel Tips", data.travel_essentials);
    mapSection("Trends", data.trending);
    mapSection("Major Issues", data.major_issues);
  } catch {}

  SEED_ITEMS.filter((it) => it.category === "Deals").forEach((it) => {
    items.push({
      id: it.id,
      section: "Deals",
      tag: "Deals",
      title: it.title,
      summary: it.summary,
      link: it.cta.url,
      canDelete: false,
    });
  });

  SEED_ITEMS.filter((it) => it.category === "K-POP").forEach((it) => {
    items.push({
      id: it.id,
      section: "K-POP Now",
      tag: "K-POP",
      title: it.title,
      summary: it.summary,
      link: it.cta.url,
      canDelete: false,
    });
  });

  return filterItemsByMode(items, mode);
}

function filterItemsByMode(items, mode) {
  if (mode === "kpop") {
    return items.filter((it) => it.section === "K-POP Now");
  }
  return items.filter((it) => it.section !== "K-POP Now");
}

async function loadSupabaseItems(mode) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, items: [] };
  try {
    const { data, error } = await supabase
      .from("korea_now_posts")
      .select("id,section,tag,title,summary,link,created_at,status")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const items = (data || [])
      .map((row) => {
        const section = normalizeSection(row.section);
        if (!section) return null;
        return {
          id: row.id,
          section,
          tag: row.tag || section,
          title: row.title || "Untitled",
          summary: row.summary || "",
          link: row.link || "",
          canDelete: true,
        };
      })
      .filter(Boolean);

    return { ok: true, items: filterItemsByMode(items, mode) };
  } catch (err) {
    console.warn("[korea-now] Supabase load failed.", err);
    return { ok: false, items: [] };
  }
}

async function isAdmin() {
  const supabase = getSupabase();
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

function ensureAdminModal() {
  if ($("#nowAdminModal")) return;
  const modal = document.createElement("div");
  modal.className = "nowModal";
  modal.id = "nowAdminModal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="nowModal__backdrop" data-close="1"></div>
    <div class="nowModal__card" role="dialog" aria-modal="true" aria-label="Add Korea Now post">
      <div class="nowModal__head">
        <div class="nowModal__title">Add Korea Now post</div>
        <button class="btn btn--ghost btn--small" data-close="1" type="button">Close</button>
      </div>
      <div class="nowModal__body">
        <label class="field">
          <div class="field__label">Section</div>
          <select id="nowFormSection" class="input">
            ${FILTERS.map((s) => `<option value="${s}">${s}</option>`).join("")}
            <option value="K-POP Now">K-POP Now</option>
          </select>
        </label>
        <label class="field">
          <div class="field__label">Tag</div>
          <input id="nowFormTag" class="input" placeholder="Ex: Alert / Deals / K-POP" />
        </label>
        <label class="field">
          <div class="field__label">Title</div>
          <input id="nowFormTitle" class="input" placeholder="Short headline" />
        </label>
        <label class="field">
          <div class="field__label">Summary</div>
          <textarea id="nowFormSummary" class="input" rows="3" placeholder="1-2 lines of context"></textarea>
        </label>
        <label class="field">
          <div class="field__label">Link (optional)</div>
          <input id="nowFormLink" class="input" placeholder="#mykorea, #kpop, or https://" />
        </label>
        <div class="field__status" id="nowFormStatus"></div>
      </div>
      <div class="nowModal__actions">
        <button class="btn btn--ghost" data-close="1" type="button">Cancel</button>
        <button class="btn btn--primary" id="nowFormSave" type="button">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener("click", (e) => {
    if (e.target?.closest?.("[data-close='1']")) {
      modal.hidden = true;
    }
  });
}

async function handleCreatePost(refresh, mode) {
  const supabase = getSupabase();
  const status = $("#nowFormStatus");
  if (!supabase) {
    if (status) status.textContent = "Supabase is not configured.";
    return;
  }

  const sectionEl = $("#nowFormSection");
  const tagEl = $("#nowFormTag");
  const titleEl = $("#nowFormTitle");
  const summaryEl = $("#nowFormSummary");
  const linkEl = $("#nowFormLink");

  let section = sectionEl ? sectionEl.value : "";
  const tag = tagEl ? tagEl.value : "";
  const title = titleEl ? titleEl.value : "";
  const summary = summaryEl ? summaryEl.value : "";
  const link = linkEl ? linkEl.value : "";

  if (!title.trim() || !summary.trim()) {
    if (status) status.textContent = "Title and summary are required.";
    return;
  }

  if (status) status.textContent = "Saving...";

  try {
    if (mode === "kpop") {
      section = "K-POP Now";
    }
    const payload = {
      section,
      tag,
      title: title.trim(),
      summary: summary.trim(),
      link: link.trim(),
      status: "active",
    };
    const { error } = await supabase.from("korea_now_posts").insert(payload);
    if (error) throw error;

    if (status) status.textContent = "Saved.";
    const modal = $("#nowAdminModal");
    if (modal) modal.hidden = true;

    if (tagEl) tagEl.value = "";
    if (titleEl) titleEl.value = "";
    if (summaryEl) summaryEl.value = "";
    if (linkEl) linkEl.value = "";

    await refresh();
    try {
      window.dispatchEvent(new Event("koreaNow:updated"));
    } catch {}
  } catch (err) {
    console.warn("[korea-now] Save failed.", err);
    if (status) status.textContent = "Save failed.";
  }
}

function bindCardActions(refresh) {
  const bindHost = (hostId) => {
    const host = $(hostId);
    if (!host || host.dataset.bound === "1") return;
    host.dataset.bound = "1";
    host.addEventListener("click", async (e) => {
      const openBtn = e.target?.closest?.(".nowItemCard__cta");
      if (openBtn) {
        const link = openBtn.dataset.link || "";
        openUrl(link);
        return;
      }
      const delBtn = e.target?.closest?.(".nowItemCard__delete");
      if (!delBtn) return;
      const id = delBtn.dataset.id || "";
      if (!id) return;
      const supabase = getSupabase();
      if (!supabase) return;
      try {
        const { error } = await supabase.from("korea_now_posts").delete().eq("id", id);
        if (error) throw error;
        await refresh();
        try {
          window.dispatchEvent(new Event("koreaNow:updated"));
        } catch {}
      } catch (err) {
        console.warn("[korea-now] Delete failed.", err);
      }
    });
  };

  bindHost("#nowCards");
  bindHost("#nowCardsKpop");
}

function ensureMyKoreaUI(page) {
  if (!page || $("#nowChips")) return;
  const section = document.createElement("section");
  section.className = "nowSection";
  section.id = "nowMyKoreaPosts";
  section.innerHTML = `
    <div class="sectionHead">
      <div>
        <div class="sectionTitle">MyKorea Updates</div>
        <div class="sectionDesc">Major issues, travel tips, trends, and deals.</div>
      </div>
      <div class="nowAdminBar" data-admin-bar="1" style="display:none">
        <button class="btn btn--primary btn--small nowAdminAddBtn" data-mode="mykorea" type="button">+ Add</button>
      </div>
    </div>
    <div class="nowFilters" id="nowChips"></div>
    <div class="nowCards" id="nowCards"></div>
  `;
  page.appendChild(section);
}

function ensureKpopUI(page) {
  if (!page) return;
  const kpopSection = page.querySelector("#nowKpop") || page;
  if (!kpopSection) return;
  const head = kpopSection.querySelector(".nowCard__head") || kpopSection.querySelector(".sectionHead");
  if (head && !head.querySelector("[data-admin-bar='1']")) {
    const bar = document.createElement("div");
    bar.className = "nowAdminBar";
    bar.dataset.adminBar = "1";
    bar.style.display = "none";
    bar.innerHTML = `<button class="btn btn--primary btn--small nowAdminAddBtn" data-mode="kpop" type="button">+ Add</button>`;
    head.appendChild(bar);
  }

  let list = kpopSection.querySelector(".nowList");
  if (!list) {
    list = document.createElement("div");
    list.className = "nowList";
    kpopSection.appendChild(list);
  }
  list.id = "nowCardsKpop";
  list.classList.add("nowCards");
}

function setAdminSectionDefaults(mode) {
  const sectionEl = $("#nowFormSection");
  if (!sectionEl) return;
  if (mode === "kpop") {
    sectionEl.value = "K-POP Now";
    sectionEl.disabled = true;
  } else {
    sectionEl.disabled = false;
    if (sectionEl.value === "K-POP Now") {
      sectionEl.value = FILTERS[0];
    }
  }
}

export async function initKoreaNow(options = {}) {
  const mode = options?.mode === "kpop" ? "kpop" : "mykorea";
  NOW_STATE.mode = mode;

  const page = mode === "kpop" ? $("#page-kpop") : $("#page-korea-now");
  if (!page) return;

  if (mode === "kpop") {
    ensureKpopUI(page);
  } else {
    page.querySelector(".nowGrid")?.remove();
    page.querySelector("#nowStatus")?.remove();
    page.querySelector("#btnReloadNow")?.remove();
    ensureMyKoreaUI(page);
  }

  const refresh = async () => {
    let items = [];
    const supa = await loadSupabaseItems(mode);
    if (supa.ok && supa.items.length) {
      items = supa.items;
    } else {
      items = await loadFallbackItems(mode);
    }

    NOW_STATE.items = items;
    if (mode === "kpop") {
      renderKpop(items);
      return;
    }
    const initial = FILTERS[0];
    const active = $("#nowChips .is-active")?.dataset?.filter || initial;
    renderChips(active);
    renderCards(active, items);
    bindChips(active, items);
  };

  NOW_STATE.refresh = refresh;

  await refresh();

  NOW_STATE.isAdmin = await isAdmin();
  if (NOW_STATE.isAdmin) {
    document.querySelectorAll("[data-admin-bar='1']").forEach((bar) => {
      bar.style.display = "flex";
    });
    ensureAdminModal();

    document.querySelectorAll(".nowAdminAddBtn").forEach((btn) => {
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        const modeForBtn = btn.dataset.mode === "kpop" ? "kpop" : "mykorea";
        const modal = $("#nowAdminModal");
        if (modal) modal.hidden = false;
        const status = $("#nowFormStatus");
        if (status) status.textContent = "";
        setAdminSectionDefaults(modeForBtn);
      });
    });

    const saveBtn = $("#nowFormSave");
    if (saveBtn && saveBtn.dataset.bound !== "1") {
      saveBtn.dataset.bound = "1";
      saveBtn.addEventListener("click", () =>
        handleCreatePost(NOW_STATE.refresh || refresh, NOW_STATE.mode)
      );
    }
  }

  if (mode === "kpop") {
    renderKpop(NOW_STATE.items);
  } else {
    const active = $("#nowChips .is-active")?.dataset?.filter || FILTERS[0];
    renderCards(active, NOW_STATE.items);
  }

  bindCardActions(refresh);
}
