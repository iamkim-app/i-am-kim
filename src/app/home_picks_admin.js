const STORAGE_KEY = "iamkim_home_picks_admin_draft_v1";
const SLOT_IDS = ["1", "2", "3", "4", "5"];

const getApp = () => window.App || {};

let HOME_PICKS_ADMIN_DIRTY = false;
let HOME_PICKS_ADMIN_BOUND = false;

// Cache fetched posts per table to avoid redundant queries
const POST_CACHE = {};

// ── Post fetching ─────────────────────────────────────────────────────────────

async function fetchPostsForSource(source) {
  const table = source === "k" || source === "k_posts" ? "k_posts" : "korea_now_posts";
  if (POST_CACHE[table]) return POST_CACHE[table];

  const { supabase } = getApp();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(table)
    .select("id,title")
    .order("id", { ascending: false })
    .limit(100);

  if (error || !data) return [];
  POST_CACHE[table] = data;
  return data;
}

// valueToSelect: if provided, select this value after populating; otherwise keep current
async function populateSourceIdSelect(slot, source, valueToSelect) {
  const root = document.querySelector("#page-home-picks-admin");
  if (!root) return;
  const select = root.querySelector(`select[data-slot="${slot}"][data-field="source_id"]`);
  if (!select) return;

  // Use provided value; fall back to current selection if already has a valid value
  const targetVal = valueToSelect !== undefined ? String(valueToSelect ?? "") : select.value;

  select.innerHTML = `<option value="">-- Select post --</option>`;
  select.disabled = true;

  const posts = await fetchPostsForSource(source);
  posts.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = String(p.id);
    opt.textContent = `[${p.id}] ${p.title || "(no title)"}`;
    select.appendChild(opt);
  });

  select.disabled = false;
  if (targetVal) select.value = targetVal;
}

async function populateAllSourceIdSelects() {
  const root = document.querySelector("#page-home-picks-admin");
  if (!root) return;
  for (const slot of SLOT_IDS) {
    const sourceEl = root.querySelector(`select[data-slot="${slot}"][data-field="source"]`);
    const source = sourceEl?.value || "k_posts";
    await populateSourceIdSelect(slot, source);
  }
}

// ── Values ────────────────────────────────────────────────────────────────────

function setStatus(message, isError = false) {
  const el = document.querySelector("#homePicksAdminStatus");
  if (!el) return;
  el.textContent = message || "";
  el.dataset.error = isError ? "1" : "0";
}

function readInputs() {
  const root = document.querySelector("#page-home-picks-admin");
  if (!root) return {};
  const inputs = Array.from(root.querySelectorAll("[data-slot][data-field]"));
  const bySlot = {};
  inputs.forEach((el) => {
    const slot = String(el.dataset.slot || "");
    const field = String(el.dataset.field || "");
    if (!slot || !field) return;
    if (!bySlot[slot]) bySlot[slot] = {};
    bySlot[slot][field] = String(el.value || "");
  });
  return bySlot;
}

// Apply all fields EXCEPT source_id (select needs options pre-loaded first)
function applyNonSourceIdValues(valuesBySlot) {
  const root = document.querySelector("#page-home-picks-admin");
  if (!root) return;
  root.querySelectorAll("[data-slot][data-field]").forEach((el) => {
    const slot = String(el.dataset.slot || "");
    const field = String(el.dataset.field || "");
    if (!slot || !field || field === "source_id") return;
    const slotValues = valuesBySlot?.[slot];
    if (!slotValues || !(field in slotValues)) return;
    el.value = String(slotValues[field] ?? "");
  });
}

// Full apply: source → populate dropdowns (with source_id pre-selected) → done
async function applyValuesWithSourceIds(valuesBySlot) {
  applyNonSourceIdValues(valuesBySlot);
  for (const slot of SLOT_IDS) {
    const root = document.querySelector("#page-home-picks-admin");
    const sourceEl = root?.querySelector(`select[data-slot="${slot}"][data-field="source"]`);
    const source = sourceEl?.value || valuesBySlot?.[slot]?.source || "k_posts";
    // Pass the target source_id directly so it gets selected after options load
    const sourceId = valuesBySlot?.[slot]?.source_id ?? "";
    await populateSourceIdSelect(slot, source, sourceId);
  }
}

function setSlotValues(slot, values) {
  const root = document.querySelector("#page-home-picks-admin");
  if (!root) return;
  root.querySelectorAll(`[data-slot="${slot}"][data-field]`).forEach((el) => {
    const field = String(el.dataset.field || "");
    if (!field || !(field in values)) return;
    el.value = String(values[field] ?? "");
  });
}

function clearSlot(slot) {
  setSlotValues(slot, {
    source: "k_posts",
    source_id: "",
    title_override: "",
    subtitle_override: "",
    link_hash: "",
  });
  setDirty(true);
  saveDraft();
  setStatus(`Slot ${slot} cleared.`);
}

// ── Draft ─────────────────────────────────────────────────────────────────────

function saveDraft() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    dirty: true,
    values: readInputs(),
    savedAt: Date.now(),
  }));
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  localStorage.removeItem(STORAGE_KEY);
}

function setDirty(value) {
  HOME_PICKS_ADMIN_DIRTY = !!value;
}

// ── Slot cards ────────────────────────────────────────────────────────────────

function ensureSlotCards() {
  // All 5 slots are now in index.html — just update the description
  const root = document.querySelector("#page-home-picks-admin");
  if (!root) return;
  const desc = root.querySelector(".pageHeader__desc");
  if (desc && desc.textContent.includes("1-3")) {
    desc.textContent = desc.textContent.replace("1-3", "1-5");
  }
}

// ── Listeners ─────────────────────────────────────────────────────────────────

function bindInputListeners() {
  const root = document.querySelector("#page-home-picks-admin");
  if (!root || HOME_PICKS_ADMIN_BOUND) return;
  HOME_PICKS_ADMIN_BOUND = true;

  // When source table changes → reload post dropdown for that slot
  root.addEventListener("change", async (e) => {
    const target = e.target;
    if (!target?.closest?.("[data-slot][data-field]")) return;
    if (target.dataset.field === "source") {
      await populateSourceIdSelect(target.dataset.slot, target.value);
    }
    setDirty(true);
    saveDraft();
  });

  root.addEventListener("input", (e) => {
    if (!e.target?.closest?.("[data-slot][data-field]")) return;
    setDirty(true);
    saveDraft();
  });

  const saveBtn = document.querySelector("#homePicksAdminSave");
  const refreshBtn = document.querySelector("#homePicksAdminRefresh");
  const actionsRow = refreshBtn?.parentElement || null;
  saveBtn?.addEventListener("click", () => saveHomePicksAdmin());
  refreshBtn?.addEventListener("click", () => loadHomePicksAdmin());

  if (actionsRow && !actionsRow.querySelector("#homePicksAdminClearAll")) {
    const clearAllBtn = document.createElement("button");
    clearAllBtn.className = "btn btn--ghost btn--small";
    clearAllBtn.id = "homePicksAdminClearAll";
    clearAllBtn.type = "button";
    clearAllBtn.textContent = "Clear All";
    clearAllBtn.addEventListener("click", () => SLOT_IDS.forEach((slot) => clearSlot(slot)));
    actionsRow.insertBefore(clearAllBtn, refreshBtn);
  }

  SLOT_IDS.forEach((slot) => {
    const slotCard = root.querySelector(`[data-slot="${slot}"][data-field]`)?.closest(".card");
    if (!slotCard || slotCard.querySelector(`[data-clear-slot="${slot}"]`)) return;
    const row = document.createElement("div");
    row.className = "row";
    row.style.justifyContent = "flex-end";
    row.style.marginTop = "8px";
    const btn = document.createElement("button");
    btn.className = "btn btn--ghost btn--small";
    btn.type = "button";
    btn.textContent = "Clear slot";
    btn.dataset.clearSlot = String(slot);
    btn.addEventListener("click", () => clearSlot(slot));
    row.appendChild(btn);
    slotCard.appendChild(row);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function setupHomePicksAdmin() {
  ensureSlotCards();
  bindInputListeners();
  // Data loading is handled by loadHomePicksAdmin (called from main.js)
}

export async function loadHomePicksAdmin() {
  const { supabase } = getApp();
  if (!supabase) {
    setStatus("Supabase not configured.", true);
    return;
  }

  // Refresh button clicked while unsaved draft is in progress
  if (HOME_PICKS_ADMIN_DIRTY) {
    setStatus("Draft in progress. Save to refresh.", true);
    return;
  }

  setStatus("Loading...");

  try {
    // Check for saved draft first
    const draft = loadDraft();
    if (draft?.values) {
      await applyValuesWithSourceIds(draft.values);
      setDirty(true);
      setStatus("Draft restored.");
      return;
    }

    // Fetch current DB state
    const { data, error } = await supabase
      .from("home_featured")
      .select("*")
      .order("slot");
    if (error) throw error;

    const valuesBySlot = {};
    (Array.isArray(data) ? data : []).forEach((row) => {
      const slot = String(row?.slot || "");
      if (!slot) return;
      valuesBySlot[slot] = {
        source: row?.source || "",
        source_id: row?.source_id ? String(row.source_id) : "",
        title_override: row?.title_override || "",
        subtitle_override: row?.subtitle_override || "",
        link_hash: row?.link_hash || "",
      };
    });

    await applyValuesWithSourceIds(valuesBySlot);
    setStatus("Loaded.");
  } catch (err) {
    setStatus(`Load failed: ${err?.message || err}`, true);
  }
}

export async function saveHomePicksAdmin() {
  const { supabase } = getApp();
  if (!supabase) {
    setStatus("Supabase not configured.", true);
    return;
  }

  setStatus("Saving...");

  try {
    const values = readInputs();
    const rows = SLOT_IDS
      .map((slot) => {
        const row = values?.[slot] || {};
        const source = String(row.source || "k_posts").trim() || "k_posts";
        const sourceId = String(row.source_id || "").trim();
        const titleOverride = String(row.title_override || "").trim();
        const subtitleOverride = String(row.subtitle_override || "").trim();
        const linkHash = String(row.link_hash || "").trim();
        return {
          slot: Number(slot),
          source,
          source_id: sourceId || null,
          title_override: titleOverride || null,
          subtitle_override: subtitleOverride || null,
          link_hash: linkHash || null,
        };
      })
      // Skip slots where neither a post nor a title is set (avoids NOT NULL error)
      .filter((row) => row.source_id !== null || row.title_override !== null);

    // Fetch existing slots to decide update vs insert
    const { data: existing, error: fetchError } = await supabase
      .from("home_featured")
      .select("slot");
    if (fetchError) throw fetchError;

    const existingSlots = new Set((existing || []).map((r) => Number(r.slot)));

    for (const row of rows) {
      if (existingSlots.has(row.slot)) {
        const { error } = await supabase
          .from("home_featured")
          .update({
            source: row.source,
            source_id: row.source_id,
            title_override: row.title_override,
            subtitle_override: row.subtitle_override,
            link_hash: row.link_hash,
          })
          .eq("slot", row.slot);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("home_featured")
          .insert(row);
        if (error) throw error;
      }
    }

    setDirty(false);
    clearDraft();
    setStatus("Saved.");
    window.dispatchEvent(new CustomEvent("homePicks:updated"));
  } catch (err) {
    setStatus(`Save failed: ${err?.message || err}`, true);
  }
}
