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

const FILTERS = ["Major Issues", "Travel Tips", "Trends", "FAQ"];
const SECTION_LABELS = {
  "Major Issues": "Major Issues",
  "Travel Tips": "Travel Tips",
  Trends: "Trends",
  FAQ: "FAQ",
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

function tokenize(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^0-9a-z\uac00-\ud7a3]+/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t && t.length >= 2);
}

const NOW_STATE = {
  items: [],
  faqQuestions: [],
  isAdmin: false,
  isSignedIn: false,
  mode: "mykorea",
  refresh: null,
  defaultChip: "",
};

let NEWS_READY_BOUND = false;
if (!NEWS_READY_BOUND) {
  NEWS_READY_BOUND = true;
  window.addEventListener("news:ready", () => {
    const want = sessionStorage.getItem("newsDefaultTab");
    if (want !== "FAQ") return;
    const btn = document.querySelector('[data-filter="FAQ"]');
    if (btn) btn.click();
    sessionStorage.removeItem("newsDefaultTab");
  });
}

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

const K_CATEGORY_SECTION_MAP = {
  kpop: "K-POP Now",
  food: "K-FOOD",
  beauty: "K-BEAUTY",
  deals: "Deals",
  shopping: "Shopping",
};

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

function mapFilterToSection(filter) {
  return filter === "FAQ" ? "Deals" : filter;
}

function renderCards(active, items) {
  const host = $("#nowCards");
  if (!host) return;
  if (active === "FAQ") {
    const input = $("#faqSearch");
    const tokens = tokenize(input?.value || "");
    const list = tokens.length
      ? NOW_STATE.faqQuestions.filter((q) => {
          const hay = tokenize(q.question || "").join(" ");
          return tokens.every((t) => hay.includes(t));
        })
      : NOW_STATE.faqQuestions;
    renderFaqList(list);
    return;
  }
  const section = mapFilterToSection(active);
  const list = items.filter((it) => it.section === section);
  if (host.id === "nowCards") {
    host.classList.toggle("is-single", list.length < 2);
  }
  host.innerHTML = list.length
    ? list
        .map((it) => renderCard(it, NOW_STATE.isAdmin && it.canDelete))
        .join("")
    : `<div class="muted small">No items yet.</div>`;
}

function renderFaqList(items) {
  const host = $("#nowCards");
  if (!host) return;
  const list = Array.isArray(items) ? items : [];
  if (host.id === "nowCards") {
    host.classList.toggle("is-single", list.length < 2);
  }
  host.innerHTML = list.length
    ? list
        .map((it) => {
          const question = escapeHtml(it.question || "Untitled");
          const answers = Array.isArray(it.faq_answers)
            ? it.faq_answers
                .filter((a) => !a?.status || a.status === "active")
                .slice()
                .sort(
                  (a, b) =>
                    new Date(b?.created_at || 0).getTime() -
                    new Date(a?.created_at || 0).getTime()
                )
            : [];
          const metaText = answers.length
            ? `${answers.length} answer${answers.length === 1 ? "" : "s"}.`
            : "No answers yet.";
          const answersHtml = answers.length
            ? answers
                .map((a) => {
                  const text = escapeHtml(a.answer || "");
                  const isBest = !!a.is_best;
                  const bestBadge = isBest ? `<span class="bestBadge">Best</span>` : "";
                  const adminBadge = NOW_STATE.isAdmin ? `<span class="adminBadge">ADMIN</span>` : "";
                  const aBadge = `<span class="qaBadge">A</span>`;
                  const adminDelete =
                    NOW_STATE.isAdmin && a.id
                      ? `<button class="btn btn--ghost btn--small faqAnswerDelete" type="button" data-answer-id="${escapeHtml(
                          a.id
                        )}" data-question-id="${escapeHtml(it.id || "")}">Delete</button>`
                      : "";
                  return `
                    <div class="faqA ${isBest ? "is-best" : ""}">
                      <div class="faqA__meta">
                        ${aBadge}
                        ${adminBadge}
                        ${bestBadge}
                      </div>
                      <div class="faqA__txt">${text}</div>
                      ${adminDelete}
                    </div>
                  `;
                })
                .join("")
            : "";
          const adminAnswer =
            NOW_STATE.isAdmin && it.id
              ? `<button class="btn btn--ghost btn--small faqAnswerBtn" type="button" data-question-id="${escapeHtml(
                  it.id
                )}">Answer</button>`
              : "";
          const adminDeleteQuestion =
            NOW_STATE.isAdmin && it.id
              ? `<button class="btn btn--ghost btn--small btn--danger faqQ__del" type="button" data-qid="${escapeHtml(
                  it.id
                )}">Delete</button>`
              : "";
          return `
            <article class="faqQ" data-qid="${escapeHtml(it.id || "")}">
              <div class="faqQ__q"><span class="qaBadge">Q</span>${question}</div>
              <div class="faqQ__meta">${metaText}</div>
              <div class="faqQ__actions">${adminAnswer}${adminDeleteQuestion}</div>
              <div class="faqAList">${answersHtml}</div>
            </article>
          `;
        })
        .join("")
    : `<div class="muted small">No items yet.</div>`;
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
  const search = document.querySelector("#faqSearch");
  if (search) {
    search.style.display = active === "FAQ" ? "block" : "none";
    if (active !== "FAQ") {
      search.value = "";
    }
  }
}

function bindChips(active, items) {
  $("#nowChips")?.querySelectorAll(".chip--filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.filter || active;
      renderChips(next);
      renderCards(next, items);
      bindChips(next, items);
      const search = $("#faqSearch");
      if (search && next !== "FAQ") {
        search.value = "";
      }
    });
  });
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
          latestAnswer: Array.isArray(row.faq_answers) && row.faq_answers.length
            ? row.faq_answers
                .slice()
                .sort(
                  (a, b) =>
                    new Date(b?.created_at || 0).getTime() -
                    new Date(a?.created_at || 0).getTime()
                )[0]
            : null,
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

async function loadFaqQuestions() {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("faq_questions")
      .select("id,question,created_at,faq_answers(id,answer,created_at,status,is_best)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("[korea-now] FAQ questions load failed.", err);
    try {
      const msg = `${err?.code || "ERR"} ${err?.message || ""}`.trim();
      window.App?.toast?.(msg || "FAQ load failed.");
    } catch {}
    return [];
  }
}

export async function fetchKPosts(category) {
  const supabase = getSupabase();
  if (!supabase) return [];

  const allowed = new Set(["kpop", "food", "beauty", "deals", "shopping"]);
  const catRaw = String(category || "kpop").toLowerCase();
  const cat = allowed.has(catRaw) ? catRaw : "kpop";
  const tagFromCat = (value) => {
    switch (value) {
      case "kpop":
        return "K-POP";
      case "food":
        return "K-FOOD";
      case "beauty":
        return "K-BEAUTY";
      case "deals":
        return "DEALS";
      case "shopping":
        return "SHOPPING";
      default:
        return "K-POP";
    }
  };

  try {
    const { data, error } = await supabase
      .from("k_posts")
      .select("id,category,title,summary,link,status,created_at,created_by")
      .eq("status", "active")
      .eq("category", cat)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return (data || [])
      .map((row) => {
        return {
          id: row.id,
          title: row.title || "Untitled",
          summary: row.summary || "",
          link: row.link || "",
          tag: tagFromCat(cat),
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.warn("[korea-now] fetchKPosts failed.", err);
    return [];
  }
}

export async function fetchIdolSpots() {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("idol_spots")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn("[korea-now] fetchIdolSpots failed.", err);
    return [];
  }
}

export async function isAdmin() {
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

async function isSignedIn() {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const userResp = await supabase.auth.getUser();
    return !!userResp?.data?.user?.id;
  } catch {
    return false;
  }
}

let K_ADMIN_REFRESH = null;

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
            <option value="K-FOOD">K-FOOD</option>
            <option value="K-BEAUTY">K-BEAUTY</option>
            <option value="Shopping">Shopping</option>
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
          <input id="nowFormLink" class="input" placeholder="#news, #kpop, or https://" />
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

function ensureFaqModal() {
  if ($("#faqAskModal")) return;
  const modal = document.createElement("div");
  modal.className = "nowModal";
  modal.id = "faqAskModal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="nowModal__backdrop" data-close="1"></div>
    <div class="nowModal__card" role="dialog" aria-modal="true" aria-label="Ask a question">
      <div class="nowModal__head">
        <div class="nowModal__title">Ask a question</div>
        <button class="btn btn--ghost btn--small" data-close="1" type="button">Close</button>
      </div>
      <div class="nowModal__body">
        <label class="field">
          <div class="field__label">Question</div>
          <textarea id="faqQuestionInput" class="input" rows="4" maxlength="500" placeholder="Type your question"></textarea>
        </label>
        <div class="field__status" id="faqQuestionStatus"></div>
      </div>
      <div class="nowModal__actions">
        <button class="btn btn--ghost" data-close="1" type="button">Cancel</button>
        <button class="btn btn--primary" id="btnFaqQuestionSubmit" type="button">Submit</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener("click", (e) => {
    if (e.target?.closest?.("[data-close='1']")) {
      modal.hidden = true;
    }
  });

  const submitBtn = $("#btnFaqQuestionSubmit");
  if (submitBtn && submitBtn.dataset.bound !== "1") {
    submitBtn.dataset.bound = "1";
    submitBtn.addEventListener("click", () => {
      submitFaqQuestion(NOW_STATE.refresh || (async () => {}));
    });
  }
}

async function submitFaqQuestion(refresh) {
  const supabase = getSupabase();
  const status = $("#faqQuestionStatus");
  if (!supabase) {
    if (status) status.textContent = "Supabase is not configured.";
    return;
  }
  const input = $("#faqQuestionInput");
  const q = String(input?.value || "").trim();
  if (!q) {
    if (status) status.textContent = "Question required";
    return;
  }
  if (q.length > 500) {
    if (status) status.textContent = "Max 500 characters";
    return;
  }
  const { data: userResp } = await supabase.auth.getUser();
  const uid = userResp?.user?.id || null;
  try {
    const { error } = await supabase
      .from("faq_questions")
      .insert({ question: q, user_id: uid, status: "active" });
    if (error) {
      console.warn("[faq] error", error);
      if (status) status.textContent = `${error.code || "ERR"} ${error.message || "Save failed."}`;
      return;
    }
    const modal = $("#faqAskModal");
    if (modal) modal.hidden = true;
    if (input) input.value = "";
    if (status) status.textContent = "";
    await refresh();
  } catch (err) {
    console.warn("[faq] error", err);
    if (status) status.textContent = "Save failed.";
  }
}

function setFaqAskVisibility() {
  const bar = $("#nowFaqBar");
  if (!bar) return;
  bar.style.display = NOW_STATE.isSignedIn ? "flex" : "none";
}
async function handleAdminSaveClick() {
  const modal = $("#nowAdminModal");
  const mode = modal?.dataset?.mode || NOW_STATE.mode;
  const category = modal?.dataset?.category || "";
  if (mode === "k") {
    await handleCreatePost(K_ADMIN_REFRESH || (() => {}), "k", category);
    return;
  }
  await handleCreatePost(NOW_STATE.refresh || (() => {}), NOW_STATE.mode);
}

async function handleCreatePost(refresh, mode, category) {
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
  const normalizeLink = (raw) => {
    const v = String(raw || "").trim();
    if (!v) return "";
    return v.startsWith("http") ? v : `https://${v}`;
  };

  if (!title.trim() || !summary.trim()) {
    if (status) status.textContent = "Title and summary are required.";
    return;
  }

  if (status) status.textContent = "Saving...";

  try {
    if (mode === "k") {
      const allowed = new Set(["kpop", "food", "beauty", "deals", "shopping"]);
      const catRaw = String(category || "kpop").toLowerCase();
      const cat = allowed.has(catRaw) ? catRaw : "kpop";
      const payload = {
        category: cat,
        title: title.trim(),
        summary: summary.trim(),
        link: normalizeLink(link),
        status: "active",
      };
      const { error } = await supabase.from("k_posts").insert(payload);
      if (error) throw error;
    } else {
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
    }

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

function bindFaqActions(refresh) {
  const host = $("#nowCards");
  if (!host || host.dataset.faqBound === "1") return;
  host.dataset.faqBound = "1";
  host.addEventListener("click", async (e) => {
    const answerBtn = e.target?.closest?.(".faqAnswerBtn");
    if (answerBtn) {
      const questionId = answerBtn.dataset.questionId || "";
      if (!questionId) return;
      const answer = window.prompt("Answer");
      if (!answer || !answer.trim()) return;
      if (answer.length > 2000) {
        alert("Max 2000 characters");
        return;
      }
      const supabase = getSupabase();
      if (!supabase) return;
      try {
        const { error } = await supabase
          .from("faq_answers")
          .insert({ question_id: questionId, answer: answer.trim(), status: "active" });
        if (error) throw error;
        await refresh();
        try {
          window.dispatchEvent(new Event("koreaNow:updated"));
        } catch {}
      } catch (err) {
        console.warn("[korea-now] FAQ answer insert failed.", err);
      }
      return;
    }
    const delQuestionBtn = e.target?.closest?.(".faqQ__del");
    if (delQuestionBtn) {
      const qid = delQuestionBtn.dataset.qid || "";
      if (!qid) return;
      const supabase = getSupabase();
      if (!supabase) return;
      try {
        const { error } = await supabase.from("faq_questions").delete().eq("id", qid);
        if (error) {
          console.warn("[korea-now] FAQ question delete failed.", error);
          return;
        }
        await refresh();
      } catch (err) {
        console.warn("[korea-now] FAQ question delete failed.", err);
      }
      return;
    }
    const delBtn = e.target?.closest?.(".faqAnswerDelete");
    if (delBtn) {
      const answerId = delBtn.dataset.answerId || "";
      if (!answerId) return;
      const supabase = getSupabase();
      if (!supabase) return;
      try {
        const { error } = await supabase.from("faq_answers").delete().eq("id", answerId);
        if (error) throw error;
        await refresh();
        try {
          window.dispatchEvent(new Event("koreaNow:updated"));
        } catch {}
      } catch (err) {
        console.warn("[korea-now] FAQ answer delete failed.", err);
      }
    }
  });
}

export async function deleteKPost(id) {
  const supabase = getSupabase();
  if (!supabase || !id) return false;
  try {
    const { error } = await supabase.from("k_posts").delete().eq("id", id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[korea-now] Delete failed.", err);
    return false;
  }
}

function ensureMyKoreaUI(page) {
  if (!page || $("#nowMyKoreaPosts")) return;
  const section = document.createElement("section");
  section.className = "nowSection";
  section.id = "nowMyKoreaPosts";
  section.innerHTML = `
    <div class="nowAdminBar" data-admin-bar="1" style="display:none">
      <button class="btn btn--primary btn--small nowAdminAddBtn" data-mode="mykorea" type="button">+ Add</button>
    </div>
    <div class="nowFaqBar" id="nowFaqBar" style="display:none">
      <button class="btn btn--primary btn--small" id="btnFaqAsk" type="button">Ask</button>
    </div>
    <input id="faqSearch" class="input faqSearch" type="search" placeholder="Search FAQ (keywords)" />
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

function setAdminSectionDefaultsForCategory(category) {
  const sectionEl = $("#nowFormSection");
  if (!sectionEl) return;
  const mapped = K_CATEGORY_SECTION_MAP[String(category || "").toLowerCase()];
  if (mapped) {
    sectionEl.value = mapped;
    sectionEl.disabled = true;
  } else {
    sectionEl.disabled = false;
  }
}

export function openKAdminModal(category) {
  ensureAdminModal();
  const modal = $("#nowAdminModal");
  if (!modal) return;
  modal.dataset.mode = "k";
  modal.dataset.category = String(category || "kpop").toLowerCase();
  modal.hidden = false;
  const status = $("#nowFormStatus");
  if (status) status.textContent = "";
  setAdminSectionDefaultsForCategory(category);
}

export function bindKAdminHandlers(refresh) {
  K_ADMIN_REFRESH = refresh;
  ensureAdminModal();
}

export async function initKoreaNow(options = {}) {
  const mode = options?.mode === "kpop" ? "kpop" : "mykorea";
  NOW_STATE.mode = mode;

  const page = mode === "kpop" ? $("#page-kpop") : $("#page-korea-now");
  if (!page) return;

  if (mode === "kpop") {
    ensureKpopUI(page);
  } else {
    const desc = page.querySelector(".pageHeader__desc");
    if (desc) {
      desc.textContent = "";
      desc.style.display = "none";
    }
    page.querySelectorAll("*").forEach((el) => {
      if (el && el.children?.length === 0) {
        const t = (el.textContent || "").trim();
        if (t.includes("Edit public/data/korea_now.json")) el.remove();
      }
    });
    page.querySelector(".nowGrid")?.remove();
    page.querySelector("#nowStatus")?.remove();
    page.querySelector("#btnReloadNow")?.remove();
    ensureMyKoreaUI(page);
    const search = $("#faqSearch");
    if (search && search.dataset.bound !== "1") {
      search.dataset.bound = "1";
      search.addEventListener("input", () => {
        const active = $("#nowChips .is-active")?.dataset?.filter || FILTERS[0];
        if (active === "FAQ") {
          renderCards("FAQ", NOW_STATE.items);
        }
      });
    }
    if (page.dataset.faqBound !== "1") {
      page.dataset.faqBound = "1";
      page.addEventListener("click", async (e) => {
        if (e.target?.closest?.("#btnFaqAsk")) {
          ensureFaqModal();
          const modal = $("#faqAskModal");
          if (modal) modal.hidden = false;
          const status = $("#faqQuestionStatus");
          if (status) status.textContent = "";
          return;
        }
      });
    }
    const t = sessionStorage.getItem("newsDefaultTab");
    if (t === "faq") {
      NOW_STATE.defaultChip = "FAQ";
    }
    sessionStorage.removeItem("newsDefaultTab");
  }
  const track = document.querySelector(".nowCards");
  if (track && track.dataset.dragBound !== "1") {
    track.dataset.dragBound = "1";
    let startX = 0;
    let dragging = false;

    track.addEventListener("pointerdown", (e) => {
      startX = e.clientX;
      dragging = false;
    });

    track.addEventListener("pointermove", (e) => {
      if (Math.abs(e.clientX - startX) > 8) dragging = true;
    });

    track.addEventListener(
      "click",
      (e) => {
        if (dragging) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );
  }

  const refresh = async () => {
    let items = [];
    const supa = await loadSupabaseItems(mode);
    if (supa.ok && supa.items.length) {
      items = supa.items;
    } else {
      items = await loadFallbackItems(mode);
    }

    if (mode !== "kpop") {
      NOW_STATE.faqQuestions = await loadFaqQuestions();
    }

    NOW_STATE.items = items;
    if (mode === "kpop") {
      renderKpop(items);
      return;
    }
    const initial = FILTERS[0];
    const defaultActive = NOW_STATE.defaultChip || initial;
    const active = $("#nowChips .is-active")?.dataset?.filter || defaultActive;
    renderChips(active);
    renderCards(active, items);
    bindChips(active, items);
  };

  NOW_STATE.refresh = refresh;

  await refresh();

  if (mode !== "kpop") {
    const want = sessionStorage.getItem("newsDefaultTab");
    if (want === "FAQ") {
      const faqBtn =
        document.querySelector('.nowFilters [data-filter="FAQ"]') ||
        document.querySelector('.nowFilters button[data-filter="FAQ"]');
      if (faqBtn) faqBtn.click();
      sessionStorage.removeItem("newsDefaultTab");
    }
  }

  NOW_STATE.isAdmin = await isAdmin();
  NOW_STATE.isSignedIn = await isSignedIn();
  if (mode !== "kpop") {
    setFaqAskVisibility();
  }
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
        if (modal) {
          modal.hidden = false;
          modal.dataset.mode = modeForBtn;
          modal.dataset.category = "";
        }
        const status = $("#nowFormStatus");
        if (status) status.textContent = "";
        setAdminSectionDefaults(modeForBtn);
      });
    });

    const saveBtn = $("#nowFormSave");
    if (saveBtn && saveBtn.dataset.bound !== "1") {
      saveBtn.dataset.bound = "1";
      saveBtn.addEventListener("click", handleAdminSaveClick);
    }
  }

  if (mode === "kpop") {
    renderKpop(NOW_STATE.items);
  } else {
    const defaultActive = NOW_STATE.defaultChip || FILTERS[0];
    const active = $("#nowChips .is-active")?.dataset?.filter || defaultActive;
    renderCards(active, NOW_STATE.items);
  }

  bindCardActions(refresh);
  if (mode !== "kpop") {
    bindFaqActions(refresh);
  }
}

window.addEventListener("koreanow:refresh", () => initKoreaNow({ mode: "mykorea" }));
