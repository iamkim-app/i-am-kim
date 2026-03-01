const STORAGE_KEY = "iamkim_home_picks_admin_draft_v1";

const getApp = () => window.App || {};

let HOME_PICKS_ADMIN_DIRTY = false;
let HOME_PICKS_ADMIN_BOUND = false;

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
  saveBtn?.addEventListener("click", () => saveHomePicksAdmin());
  refreshBtn?.addEventListener("click", () => loadHomePicksAdmin());
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
    const slots = ["1", "2", "3"];
    const rows = slots.map((slot) => {
      const row = values?.[slot] || {};
      const source = String(row.source || "").trim();
      const sourceId = String(row.source_id || "").trim();
      const titleOverride = String(row.title_override || "").trim();
      const subtitleOverride = String(row.subtitle_override || "").trim();
      const linkHash = String(row.link_hash || "").trim();
      return {
        slot: Number(slot),
        source,
        source_id: sourceId,
        title_override: titleOverride || null,
        subtitle_override: subtitleOverride || null,
        link_hash: linkHash || null,
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
