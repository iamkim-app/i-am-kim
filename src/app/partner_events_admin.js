// partner_events_admin.js — Admin CRUD for partner_events table

const getApp = () => window.App || {};

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setBody(html) {
  const el = document.getElementById("partnerAdminBody");
  if (el) el.innerHTML = html;
}

function setStatus(html) {
  const el = document.getElementById("partnerAdminStatus");
  if (el) el.innerHTML = html;
}

// ── Page Shell ────────────────────────────────────────────────────────────────

export function ensurePartnerAdminUI() {
  let section = document.getElementById("page-partner-admin");

  if (!section) {
    const main = document.querySelector(".main");
    if (!main) return;
    const footer = main.querySelector(".footer");
    section = document.createElement("section");
    section.className = "page";
    section.id = "page-partner-admin";
    section.dataset.page = "partner-admin";
    section.hidden = true;
    if (footer) main.insertBefore(section, footer);
    else main.appendChild(section);
  }

  // Already populated
  if (document.getElementById("partnerAdminBody")) return;

  section.innerHTML = `
    <div style="padding:20px 16px 8px;max-width:800px;margin:0 auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:4px;">
        <div>
          <h2 style="font-size:22px;font-weight:850;letter-spacing:-0.02em;margin:0 0 4px;">Partner Events</h2>
          <p style="font-size:13px;color:rgba(11,18,32,0.55);margin:0;">Manage partner/sponsor cards on the home hero strip.</p>
        </div>
        <a href="#admin" style="font-size:13px;font-weight:700;color:rgba(11,18,32,0.6);text-decoration:none;">← Back to Admin</a>
      </div>
    </div>
    <div style="max-width:800px;margin:0 auto;padding:0 16px 80px;">
      <div id="partnerAdminStatus" style="margin-bottom:8px;"></div>
      <div id="partnerAdminBody">
        <div style="padding:20px 0;color:rgba(11,18,32,0.45);font-size:14px;">Loading…</div>
      </div>
    </div>
  `;
}

// ── Auth guard + setup ────────────────────────────────────────────────────────

export async function setupPartnerAdmin() {
  ensurePartnerAdminUI();

  const statusEl = document.getElementById("partnerAdminStatus");
  const bodyEl = document.getElementById("partnerAdminBody");
  if (!statusEl || !bodyEl) {
    console.warn("[partner-admin] DOM elements not found after ensurePartnerAdminUI");
    return;
  }

  const { supabase, navigateToHome } = getApp();
  if (!supabase) {
    setBody(`<div style="padding:16px;color:#ef4444;font-size:14px;">Supabase not configured.</div>`);
    return;
  }

  setBody(`<div style="padding:20px 0;color:rgba(11,18,32,0.45);font-size:14px;">Checking authorization…</div>`);

  try {
    const userResp = await supabase.auth.getUser();
    const uid = userResp?.data?.user?.id || null;

    if (!uid) {
      setBody(`<div style="padding:16px;color:#ef4444;font-size:14px;">Not signed in. Redirecting…</div>`);
      setTimeout(() => navigateToHome?.(), 1200);
      return;
    }

    const { data: roleRow, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .eq("role", "admin")
      .maybeSingle();

    if (roleErr) throw roleErr;

    if (roleRow?.role !== "admin") {
      setBody(`<div style="padding:16px;color:#ef4444;font-size:14px;">Not authorized. Redirecting…</div>`);
      setTimeout(() => navigateToHome?.(), 1200);
      return;
    }

    await loadPartnerAdmin();
  } catch (err) {
    console.error("[partner-admin] setup error:", err);
    setBody(`<div style="padding:16px;color:#ef4444;font-size:14px;">Error: ${esc(err?.message || String(err))}</div>`);
  }
}

// ── Load & render list ────────────────────────────────────────────────────────

export async function loadPartnerAdmin() {
  const bodyEl = document.getElementById("partnerAdminBody");
  if (!bodyEl) return;

  bodyEl.innerHTML = `<div style="padding:20px 0;color:rgba(11,18,32,0.45);font-size:14px;">Loading events…</div>`;

  const { supabase } = getApp();
  if (!supabase) return;

  try {
    const { data: events, error } = await supabase
      .from("partner_events")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    renderPartnerAdminUI(events || []);
  } catch (err) {
    console.error("[partner-admin] load error:", err);
    bodyEl.innerHTML = `
      <div style="padding:16px;background:#fef2f2;border-radius:12px;color:#b91c1c;font-size:14px;">
        <strong>Failed to load:</strong> ${esc(err?.message || String(err))}
        <br><span style="font-size:12px;opacity:0.7;">Make sure the partner_events table exists in Supabase (run supabase_partner_events.sql).</span>
      </div>
    `;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderPartnerAdminUI(events) {
  const bodyEl = document.getElementById("partnerAdminBody");
  if (!bodyEl) return;

  bodyEl.innerHTML = `
    <!-- Add new event (collapsible) -->
    <div style="background:#fff;border:1px solid #efefef;border-radius:16px;margin-bottom:16px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;">
        <div style="font-weight:800;font-size:15px;">Events <span style="color:rgba(11,18,32,0.4);font-weight:600;">(${events.length})</span></div>
        <div style="display:flex;gap:8px;">
          <button id="btnPartnerAdminRefresh"
            style="padding:6px 14px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;font-size:13px;font-weight:700;cursor:pointer;">
            Refresh
          </button>
          <button id="btnPartnerAdminAdd"
            style="padding:6px 14px;border-radius:10px;border:none;background:#0b1220;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">
            + New Event
          </button>
        </div>
      </div>

      <!-- Add form (hidden by default) -->
      <div id="partnerAddFormWrap" hidden
           style="border-top:1px solid #efefef;padding:16px;background:#fafafa;">
        <div style="font-weight:800;font-size:14px;margin-bottom:12px;">New Event</div>
        ${renderEventForm("new", null)}
      </div>
    </div>

    <!-- Event list -->
    <div id="partnerEventsList">
      ${events.length === 0
        ? `<div style="padding:24px;text-align:center;color:rgba(11,18,32,0.4);font-size:14px;">No events yet. Click "+ New Event" to add one.</div>`
        : events.map((ev) => renderEventItem(ev)).join("")
      }
    </div>
  `;

  bindPartnerAdminEvents(bodyEl, events);
}

// ── Form HTML ─────────────────────────────────────────────────────────────────

function renderEventForm(formId, ev) {
  const isEdit = !!ev;
  const val = (f) => (isEdit ? esc(ev[f] || "") : "");
  const imgVal = isEdit && Array.isArray(ev.images) ? ev.images.join("\n") : "";
  const expVal = isEdit && ev.expires_at ? ev.expires_at.slice(0, 16) : "";
  const isChecked = isEdit ? ev.is_active : true;

  const fieldStyle = "display:flex;flex-direction:column;gap:5px;";
  const labelStyle = "font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:rgba(11,18,32,0.5);";
  const inputStyle = "padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;font-size:14px;width:100%;box-sizing:border-box;background:#fff;";
  const textareaStyle = inputStyle + "resize:vertical;font-family:inherit;";

  return `
    <div data-form="${formId}"
         style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">

      <div style="${fieldStyle}grid-column:1/-1">
        <label style="${labelStyle}">Title *</label>
        <input name="title" value="${val("title")}" placeholder="Event title"
               style="${inputStyle}" />
      </div>

      <div style="${fieldStyle}">
        <label style="${labelStyle}">Subtitle</label>
        <input name="subtitle" value="${val("subtitle")}" placeholder="Short tagline"
               style="${inputStyle}" />
      </div>

      <div style="${fieldStyle}">
        <label style="${labelStyle}">Coupon Code</label>
        <input name="coupon_code" value="${val("coupon_code")}" placeholder="KIMFAN20"
               style="${inputStyle}" />
      </div>

      <div style="${fieldStyle}grid-column:1/-1">
        <label style="${labelStyle}">Description</label>
        <textarea name="description" rows="4" placeholder="Full event description"
                  style="${textareaStyle}">${isEdit ? esc(ev.description || "") : ""}</textarea>
      </div>

      <div style="${fieldStyle}grid-column:1/-1">
        <label style="${labelStyle}">Image URLs (one per line)</label>
        <textarea name="images" rows="3" placeholder="https://cdn.example.com/image.jpg"
                  style="${textareaStyle}">${imgVal}</textarea>
      </div>

      <div style="${fieldStyle}">
        <label style="${labelStyle}">Naver Map URL</label>
        <input name="naver_map_url" value="${val("naver_map_url")}" placeholder="https://naver.me/…"
               style="${inputStyle}" />
      </div>

      <div style="${fieldStyle}">
        <label style="${labelStyle}">Expires At</label>
        <input name="expires_at" type="datetime-local" value="${expVal}"
               style="${inputStyle}" />
      </div>

      <div style="grid-column:1/-1;display:flex;align-items:center;gap:10px;padding:4px 0;">
        <input type="checkbox" name="is_active" id="isActive_${formId}"
               ${isChecked ? "checked" : ""}
               style="width:16px;height:16px;cursor:pointer;" />
        <label for="isActive_${formId}" style="font-size:14px;font-weight:600;cursor:pointer;">Active (show on home strip)</label>
      </div>

      <div style="grid-column:1/-1;display:flex;gap:8px;padding-top:4px;">
        ${isEdit
          ? `<button data-action="save-edit" data-id="${ev.id}"
               style="padding:10px 20px;border-radius:12px;border:none;background:#0b1220;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">
               Save changes
             </button>
             <button data-action="cancel-edit" data-id="${ev.id}"
               style="padding:10px 20px;border-radius:12px;border:1px solid #e5e7eb;background:#fff;font-size:14px;font-weight:600;cursor:pointer;">
               Cancel
             </button>`
          : `<button data-action="add-event"
               style="padding:10px 20px;border-radius:12px;border:none;background:#0b1220;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">
               Add Event
             </button>
             <button data-action="cancel-add"
               style="padding:10px 20px;border-radius:12px;border:1px solid #e5e7eb;background:#fff;font-size:14px;font-weight:600;cursor:pointer;">
               Cancel
             </button>`
        }
      </div>
    </div>
  `;
}

// ── Event item HTML ───────────────────────────────────────────────────────────

function renderEventItem(ev) {
  const expiryStr = ev.expires_at
    ? new Date(ev.expires_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "No expiry";

  const activeBadge = ev.is_active
    ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;background:#dcfce7;color:#16a34a;font-size:11px;font-weight:800;">● Active</span>`
    : `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;background:#f3f4f6;color:#6b7280;font-size:11px;font-weight:800;">○ Inactive</span>`;

  const imgCount = Array.isArray(ev.images) && ev.images.length
    ? `<span style="font-size:12px;color:rgba(11,18,32,0.4);">${ev.images.length} image${ev.images.length > 1 ? "s" : ""}</span>`
    : "";

  const couponBadge = ev.coupon_code
    ? `<span style="font-size:12px;font-weight:700;color:#B45309;background:rgba(245,158,11,0.1);padding:2px 8px;border-radius:6px;">${esc(ev.coupon_code)}</span>`
    : "";

  return `
    <div data-event-item="${esc(ev.id)}"
         style="background:#fff;border:1px solid #efefef;border-radius:14px;margin-bottom:10px;overflow:hidden;">
      <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;">
        <!-- Thumbnail -->
        ${Array.isArray(ev.images) && ev.images[0]
          ? `<img src="${esc(ev.images[0])}" alt="" loading="lazy"
                  style="width:56px;height:56px;border-radius:10px;object-fit:cover;flex-shrink:0;background:#f3f4f6;" />`
          : `<div style="width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg,#F59E0B,#EF4444);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px;">🤝</div>`
        }

        <!-- Info -->
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;font-size:15px;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ev.title || "")}</div>
          <div style="font-size:13px;color:rgba(11,18,32,0.5);margin-bottom:7px;">${esc(ev.subtitle || "")}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            ${activeBadge}
            <span style="font-size:12px;color:rgba(11,18,32,0.4);">Expires: ${expiryStr}</span>
            ${imgCount}
            ${couponBadge}
          </div>
        </div>

        <!-- Actions -->
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
          <button data-action="toggle-active" data-id="${esc(ev.id)}" data-active="${ev.is_active ? "1" : "0"}"
            style="padding:5px 12px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">
            ${ev.is_active ? "Deactivate" : "Activate"}
          </button>
          <button data-action="edit-event" data-id="${esc(ev.id)}"
            style="padding:5px 12px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:12px;font-weight:700;cursor:pointer;">
            Edit
          </button>
          <button data-action="delete-event" data-id="${esc(ev.id)}"
            style="padding:5px 12px;border-radius:8px;border:1px solid #fecaca;background:#fff;color:#ef4444;font-size:12px;font-weight:700;cursor:pointer;">
            Delete
          </button>
        </div>
      </div>

      <!-- Edit form (hidden) -->
      <div id="editForm-${esc(ev.id)}" hidden
           style="border-top:1px solid #efefef;padding:16px;background:#fafafa;">
      </div>
    </div>
  `;
}

// ── Form data ─────────────────────────────────────────────────────────────────

function readFormData(formEl) {
  const get = (name) => {
    const el = formEl.querySelector(`[name="${name}"]`);
    if (!el) return "";
    if (el.type === "checkbox") return el.checked;
    return el.value.trim();
  };

  const images = (get("images") || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const expiresRaw = get("expires_at");

  return {
    title: get("title"),
    subtitle: get("subtitle") || null,
    description: get("description") || null,
    images,
    coupon_code: get("coupon_code") || null,
    naver_map_url: get("naver_map_url") || null,
    expires_at: expiresRaw ? new Date(expiresRaw).toISOString() : null,
    is_active: get("is_active"),
  };
}

// ── Event bindings ────────────────────────────────────────────────────────────

function bindPartnerAdminEvents(bodyEl, events) {
  const { supabase, toast, clearPartnerEventsCache } = getApp();
  const showToast = (msg) => { if (toast) toast(msg); else console.log("[partner-admin]", msg); };

  // ── Header buttons (direct) ───────────────────────────────────────────────

  const refreshBtn = bodyEl.querySelector("#btnPartnerAdminRefresh");
  if (refreshBtn) refreshBtn.onclick = () => loadPartnerAdmin();

  const addToggleBtn = bodyEl.querySelector("#btnPartnerAdminAdd");
  if (addToggleBtn) addToggleBtn.onclick = () => {
    const wrap = bodyEl.querySelector("#partnerAddFormWrap");
    if (wrap) wrap.hidden = !wrap.hidden;
  };

  const cancelAddBtn = bodyEl.querySelector('[data-action="cancel-add"]');
  if (cancelAddBtn) cancelAddBtn.onclick = () => {
    const wrap = bodyEl.querySelector("#partnerAddFormWrap");
    if (wrap) wrap.hidden = true;
  };

  const addEventBtn = bodyEl.querySelector('[data-action="add-event"]');
  if (addEventBtn) addEventBtn.onclick = async () => {
    const formEl = bodyEl.querySelector('[data-form="new"]');
    if (!formEl) return;
    const data = readFormData(formEl);
    if (!data.title) { showToast("Title is required."); return; }
    const { error } = await supabase.from("partner_events").insert([data]);
    if (error) { showToast("Failed to add: " + error.message); return; }
    showToast("Event added!");
    clearPartnerEventsCache?.();
    await loadPartnerAdmin();
  };

  // ── Per-item buttons (direct, no delegation) ──────────────────────────────

  events.forEach((ev) => {
    const id = ev.id;

    // Toggle active
    const toggleBtn = bodyEl.querySelector(`[data-action="toggle-active"][data-id="${id}"]`);
    if (toggleBtn) toggleBtn.onclick = async () => {
      const { error } = await supabase
        .from("partner_events")
        .update({ is_active: !ev.is_active })
        .eq("id", id);
      if (error) { showToast("Failed: " + error.message); return; }
      showToast(ev.is_active ? "Deactivated." : "Activated!");
      clearPartnerEventsCache?.();
      await loadPartnerAdmin();
    };

    // Edit — toggle inline form, populate with ev data
    const editBtn = bodyEl.querySelector(`[data-action="edit-event"][data-id="${id}"]`);
    if (editBtn) {
      editBtn.onclick = () => {
        const itemEl = editBtn.closest("[data-event-item]");
        const editContainer = itemEl
          ? itemEl.querySelector(`[id="editForm-${id}"]`)
          : bodyEl.querySelector(`[id="editForm-${id}"]`);
        if (!editContainer) return;

        if (!editContainer.hidden) {
          editContainer.hidden = true;
          editContainer.innerHTML = "";
          return;
        }
        // Inject form HTML with current ev data
        editContainer.innerHTML = renderEventForm("edit-" + id, ev);
        editContainer.hidden = false;

        // Save
        const saveBtn = editContainer.querySelector('[data-action="save-edit"]');
        if (saveBtn) saveBtn.onclick = async () => {
          const formEl = editContainer.querySelector("[data-form]");
          if (!formEl) return;
          const data = readFormData(formEl);
          if (!data.title) { showToast("Title is required."); return; }
          const { error } = await supabase
            .from("partner_events")
            .update(data)
            .eq("id", id);
          if (error) { showToast("Failed to save: " + error.message); return; }
          showToast("Saved!");
          clearPartnerEventsCache?.();
          await loadPartnerAdmin();
        };

        // Cancel
        const cancelBtn = editContainer.querySelector('[data-action="cancel-edit"]');
        if (cancelBtn) cancelBtn.onclick = () => {
          editContainer.hidden = true;
          editContainer.innerHTML = "";
        };
      };
    }

    // Delete
    const deleteBtn = bodyEl.querySelector(`[data-action="delete-event"][data-id="${id}"]`);
    if (deleteBtn) deleteBtn.onclick = async () => {
      if (!confirm("Delete this event?")) return;
      const { error } = await supabase
        .from("partner_events")
        .delete()
        .eq("id", id);
      if (error) { showToast("Failed to delete: " + error.message); return; }
      showToast("Deleted.");
      clearPartnerEventsCache?.();
      await loadPartnerAdmin();
    };
  });
}
