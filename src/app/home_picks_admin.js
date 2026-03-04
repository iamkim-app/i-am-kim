const STORAGE_KEY = "iamkim_home_picks_admin_draft_v1";
const SLOT_IDS = ["1", "2", "3", "4", "5"];

const getApp = () => window.App || {};

let HOME_PICKS_ADMIN_DIRTY = false;
let HOME_PICKS_ADMIN_BOUND = false;

function ensureSlotCards() {
  const root = document.querySelector("#page-home-picks-admin");
  if (!root || root.dataset.slotsReady === "1") return;
  const form = root.querySelector("#homePicksAdminForm");
  if (!form) return;

  const desc = root.querySelector(".pageHeader__desc");
  if (desc && desc.textContent.includes("1-3")) {
    desc.textContent = desc.textContent.replace("1-3", "1-5");
  }

  const cards = Array.from(form.querySelectorAll(".card"));
  const template = cards[0] || null;
  if (!template) return;

  SLOT_IDS.forEach((slot, idx) => {
    const exists = form.querySelector(`[data-slot="${slot}"][data-field]`);
    if (exists) return;
    const clone = template.cloneNode(true);
    clone.querySelectorAll("[data-slot][data-field]").forEach((el) => {
      el.dataset.slot = slot;
      if (el.tagName === "SELECT") {
        el.value = "k_posts";
      } else {
        el.value = "";
      }
    });
    const label = clone.querySelector(".muted.small");
    if (label) label.textContent = `Slot ${slot}`;
    form.appendChild(clone);
  });

  root.dataset.slotsReady = "1";
}

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

function applyValues(valuesBySlot) {
  const root = document.querySelector("#page-home-picks-admin");
  if (!root) return;
  const inputs = Array.from(root.querySelectorAll("[data-slot][data-field]"));
  inputs.forEach((el) => {
    const slot = String(el.dataset.slot || "");
    const field = String(el.dataset.field || "");
    const slotValues = valuesBySlot?.[slot];
    if (!slotValues || !(field in slotValues)) return;
    el.value = String(slotValues[field] ?? "");
  });
}

function setSlotValues(slot, values) {
  const root = document.querySelector("#page-home-picks-admin");
  if (!root) return;
  const inputs = Array.from(root.querySelectorAll(`[data-slot="${slot}"][data-field]`));
  inputs.forEach((el) => {
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

function saveDraft() {
  const payload = {
    dirty: true,
    values: readInputs(),
    savedAt: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
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

function bindInputListeners() {
  const root = document.querySelector("#page-home-picks-admin");
  if (!root || HOME_PICKS_ADMIN_BOUND) return;
  HOME_PICKS_ADMIN_BOUND = true;

  const onChange = (e) => {
    const target = e.target;
    if (!target?.closest?.("[data-slot][data-field]")) return;
    setDirty(true);
    saveDraft();
  };

  root.addEventListener("input", onChange);
  root.addEventListener("change", onChange);

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
    clearAllBtn.addEventListener("click", () => {
      SLOT_IDS.forEach((slot) => clearSlot(slot));
    });
    actionsRow.insertBefore(clearAllBtn, refreshBtn);
  }

  const slots = new Set(SLOT_IDS);
  slots.forEach((slot) => {
    if (!slot) return;
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

function applyDraftIfPresent() {
  const draft = loadDraft();
  if (!draft?.values) return false;
  applyValues(draft.values);
  setDirty(true);
  setStatus("Draft restored.");
  return true;
}

export function setupHomePicksAdmin() {
  ensureSlotCards();
  bindInputListeners();
  applyDraftIfPresent();
}

export async function loadHomePicksAdmin() {
  const { supabase } = getApp();
  if (!supabase) {
    setStatus("Supabase not configured.", true);
    return;
  }
  if (HOME_PICKS_ADMIN_DIRTY) {
    setStatus("Draft in progress. Save to refresh.", true);
    return;
  }

  setStatus("Loading...");

  try {
    const { data, error } = await supabase
      .from("home_featured")
      .select("*")
      .order("slot");
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const valuesBySlot = {};
    rows.forEach((row) => {
      const slot = String(row?.slot || "");
      if (!slot) return;
      valuesBySlot[slot] = {
        source: row?.source || "",
        source_id: row?.source_id || "",
        title_override: row?.title_override || "",
        subtitle_override: row?.subtitle_override || "",
        link_hash: row?.link_hash || "",
      };
    });

    applyValues(valuesBySlot);
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
    const rows = SLOT_IDS.map((slot) => {
      const row = values?.[slot] || {};
      const source = String(row.source || "k_posts").trim() || "k_posts";
      const sourceId = String(row.source_id || "").trim();
      const titleOverride = String(row.title_override || "").trim();
      const subtitleOverride = String(row.subtitle_override || "").trim();
      const linkHash = String(row.link_hash || "").trim();
      return {
        slot: Number(slot),
        source,
        source_id: sourceId,
        title_override: titleOverride ? titleOverride : null,
        subtitle_override: subtitleOverride ? subtitleOverride : null,
        link_hash: linkHash ? linkHash : null,
      };
    });

    const { error } = await supabase
      .from("home_featured")
      .upsert(rows, { onConflict: "slot" });
    if (error) throw error;

    setDirty(false);
    clearDraft();
    setStatus("Saved.");
  } catch (err) {
    setStatus(`Save failed: ${err?.message || err}`, true);
  }
}
