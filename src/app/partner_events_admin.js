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

// ── Page Shell ────────────────────────────────────────────────────────────────

export function ensurePartnerAdminUI() {
  // The page shell may already exist as an empty element in index.html.
  // Find or create it, then inject content if not already present.
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
    if (footer) {
      main.insertBefore(section, footer);
    } else {
      main.appendChild(section);
    }
  }

  // Skip if content already injected
  if (document.getElementById("partnerAdminBody")) return;

  section.innerHTML = `
    <div class="pageHeader">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div>
          <h2 class="pageHeader__title">Partner Events</h2>
          <p class="pageHeader__desc">Manage sponsor cards shown on the home hero strip.</p>
        </div>
        <a href="#admin" class="btn btn--ghost btn--small" style="margin-left:auto;">← Back to Admin</a>
      </div>
    </div>
    <div id="partnerAdminStatus"></div>
    <div id="partnerAdminBody"></div>
  `;
}

// ── Auth guard + init ─────────────────────────────────────────────────────────

export async function setupPartnerAdmin() {
  ensurePartnerAdminUI();

  const statusEl = document.getElementById("partnerAdminStatus");
  const bodyEl = document.getElementById("partnerAdminBody");
  if (!statusEl || !bodyEl) return;

  const { supabase, navigateToHome } = getApp();
  if (!supabase) {
    statusEl.innerHTML = `<div class="card card--inner"><div class="muted small">Supabase not configured.</div></div>`;
    return;
  }

  const userResp = await supabase.auth.getUser();
  const uid = userResp?.data?.user?.id || null;
  if (!uid) {
    statusEl.innerHTML = `<div class="card card--inner"><div class="muted small">Not authorized. Redirecting…</div></div>`;
    setTimeout(() => navigateToHome?.(), 1000);
    return;
  }

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();

  if (roleRow?.role !== "admin") {
    statusEl.innerHTML = `<div class="card card--inner"><div class="muted small">Not authorized. Redirecting…</div></div>`;
    setTimeout(() => navigateToHome?.(), 1000);
    return;
  }

  statusEl.innerHTML = "";
  await loadPartnerAdmin();
}

export async function loadPartnerAdmin() {
  const bodyEl = document.getElementById("partnerAdminBody");
  if (!bodyEl) return;
  bodyEl.innerHTML = `<div class="muted small" style="padding:8px 0;">Loading…</div>`;

  const { supabase } = getApp();
  if (!supabase) return;

  const { data: events, error } = await supabase
    .from("partner_events")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    bodyEl.innerHTML = `<div class="muted small">Failed to load events: ${esc(error.message)}</div>`;
    return;
  }

  renderPartnerAdminUI(events || []);
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderPartnerAdminUI(events) {
  const bodyEl = document.getElementById("partnerAdminBody");
  if (!bodyEl) return;

  bodyEl.innerHTML = `
    <!-- Add new event -->
    <div class="card card--inner" style="margin-bottom:16px;">
      <div class="card__head">
        <div class="card__title">Add New Event</div>
      </div>
      ${renderEventForm("new", null)}
    </div>

    <!-- Event list -->
    <div class="card card--inner">
      <div class="card__head">
        <div class="card__title">Events (${events.length})</div>
        <button class="btn btn--ghost btn--small" id="btnPartnerAdminRefresh">Refresh</button>
      </div>
      <div id="partnerEventsList">
        ${
          events.length === 0
            ? '<div class="muted small" style="padding:12px 0;">No events yet.</div>'
            : events.map((ev) => renderEventItem(ev)).join("")
        }
      </div>
    </div>
  `;

  bindPartnerAdminEvents(bodyEl, events);
}

function renderEventForm(formId, ev) {
  const isEdit = !!ev;
  const val = (field) => (isEdit ? esc(ev[field] || "") : "");
  const imgVal = isEdit && Array.isArray(ev.images) ? ev.images.join("\n") : "";
  const expVal =
    isEdit && ev.expires_at ? ev.expires_at.slice(0, 16) : "";

  return `
    <div class="grid" data-form="${formId}" style="gap:10px;margin-top:12px;">
      <label class="field">
        <div class="field__label">Title *</div>
        <input class="input" name="title" value="${val("title")}" placeholder="Event title" />
      </label>
      <label class="field">
        <div class="field__label">Subtitle</div>
        <input class="input" name="subtitle" value="${val("subtitle")}" placeholder="Short tagline" />
      </label>
      <label class="field" style="grid-column:1/-1">
        <div class="field__label">Description</div>
        <textarea class="input" name="description" rows="3"
          placeholder="Full event description">${isEdit ? esc(ev.description || "") : ""}</textarea>
      </label>
      <label class="field" style="grid-column:1/-1">
        <div class="field__label">Image URLs (one per line)</div>
        <textarea class="input" name="images" rows="3" placeholder="https://...">${imgVal}</textarea>
      </label>
      <label class="field">
        <div class="field__label">Coupon Code</div>
        <input class="input" name="coupon_code" value="${val("coupon_code")}" placeholder="KIMFAN20" />
      </label>
      <label class="field">
        <div class="field__label">Naver Map URL</div>
        <input class="input" name="naver_map_url" value="${val("naver_map_url")}" placeholder="https://naver.me/…" />
      </label>
      <label class="field">
        <div class="field__label">Expires At</div>
        <input class="input" name="expires_at" type="datetime-local" value="${expVal}" />
      </label>
      <label class="field" style="display:flex;align-items:center;gap:8px;padding-top:4px;">
        <input type="checkbox" name="is_active" ${isEdit ? (ev.is_active ? "checked" : "") : "checked"} />
        <span class="field__label" style="margin:0;">Active</span>
      </label>
      <div style="grid-column:1/-1;display:flex;gap:8px;margin-top:4px;">
        ${
          isEdit
            ? `<button class="btn btn--primary btn--small" data-action="save-edit" data-id="${ev.id}">Save changes</button>
               <button class="btn btn--ghost btn--small" data-action="cancel-edit" data-id="${ev.id}">Cancel</button>`
            : `<button class="btn btn--primary btn--small" data-action="add-event">Add Event</button>`
        }
      </div>
    </div>
  `;
}

function renderEventItem(ev) {
  const expiryStr = ev.expires_at
    ? new Date(ev.expires_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "No expiry";

  const statusDot = ev.is_active
    ? `<span style="color:#16a34a;font-weight:700;font-size:12px;">● Active</span>`
    : `<span style="color:#9ca3af;font-weight:700;font-size:12px;">○ Inactive</span>`;

  const imgCount =
    Array.isArray(ev.images) && ev.images.length
      ? `<span class="muted small">${ev.images.length} image${ev.images.length > 1 ? "s" : ""}</span>`
      : "";

  return `
    <div class="adminCard" data-event-item="${ev.id}"
         style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;font-size:14px;margin-bottom:2px;">${esc(ev.title || "")}</div>
          <div class="muted small" style="margin-bottom:6px;">${esc(ev.subtitle || "")}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            ${statusDot}
            <span class="muted small">Expires: ${expiryStr}</span>
            ${imgCount}
            ${ev.coupon_code ? `<span style="font-size:12px;color:#B45309;font-weight:700;">Coupon: ${esc(ev.coupon_code)}</span>` : ""}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn btn--ghost btn--small" data-action="edit-event" data-id="${ev.id}">Edit</button>
          <button class="btn btn--ghost btn--small btn--danger" data-action="delete-event" data-id="${ev.id}">Delete</button>
        </div>
      </div>
      <div id="editForm-${ev.id}" hidden></div>
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

  const imagesRaw = get("images");
  const images = imagesRaw
    ? imagesRaw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

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

  bodyEl
    .querySelector("#btnPartnerAdminRefresh")
    ?.addEventListener("click", () => loadPartnerAdmin());

  // Add event
  bodyEl
    .querySelector('[data-action="add-event"]')
    ?.addEventListener("click", async () => {
      const formEl = bodyEl.querySelector('[data-form="new"]');
      if (!formEl) return;
      const data = readFormData(formEl);
      if (!data.title) {
        toast?.("Title is required.", true);
        return;
      }
      const { error } = await supabase.from("partner_events").insert([data]);
      if (error) {
        toast?.("Failed to add event: " + error.message, true);
        return;
      }
      toast?.("Event added!");
      clearPartnerEventsCache?.();
      await loadPartnerAdmin();
    });

  // Edit / Delete (delegated)
  bodyEl
    .querySelector("#partnerEventsList")
    ?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const { action, id } = btn.dataset;

      if (action === "edit-event") {
        const container = bodyEl.querySelector(`#editForm-${id}`);
        if (!container) return;
        if (!container.hidden) {
          container.hidden = true;
          container.innerHTML = "";
          return;
        }
        const ev = events.find((ev) => ev.id === id);
        if (!ev) return;
        container.innerHTML = renderEventForm("edit-" + id, ev);
        container.hidden = false;

        container
          .querySelector('[data-action="save-edit"]')
          ?.addEventListener("click", async () => {
            const formEl = container.querySelector("[data-form]");
            const data = readFormData(formEl);
            if (!data.title) {
              toast?.("Title is required.", true);
              return;
            }
            const { error } = await supabase
              .from("partner_events")
              .update(data)
              .eq("id", id);
            if (error) {
              toast?.("Failed to update: " + error.message, true);
              return;
            }
            toast?.("Event updated!");
            clearPartnerEventsCache?.();
            await loadPartnerAdmin();
          });

        container
          .querySelector('[data-action="cancel-edit"]')
          ?.addEventListener("click", () => {
            container.hidden = true;
            container.innerHTML = "";
          });
      }

      if (action === "delete-event") {
        if (!confirm("Delete this partner event?")) return;
        const { error } = await supabase
          .from("partner_events")
          .delete()
          .eq("id", id);
        if (error) {
          toast?.("Failed to delete: " + error.message, true);
          return;
        }
        toast?.("Event deleted.");
        clearPartnerEventsCache?.();
        await loadPartnerAdmin();
      }
    });
}
