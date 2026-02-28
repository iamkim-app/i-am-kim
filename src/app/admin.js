import { getSession, loadBanStatus } from "./auth.js";
import { loadCommunityPosts, timeAgo } from "./community.js";

const { $, $$, supabase, toast, escapeHtml, truncateText, navigateToHome } = window.App;

/* ----------------------------- ADMIN ----------------------------------- */

function ensureAdminUI() {
  const main = $(".main");
  if (!main || $("#page-admin")) return;
  const footer = main.querySelector(".footer");
  const section = document.createElement("section");
  section.className = "page";
  section.id = "page-admin";
  section.dataset.page = "admin";
  section.hidden = true;
  section.innerHTML = `
    <div class="pageHeader">
      <h2 class="pageHeader__title">Admin</h2>
      <p class="pageHeader__desc">Moderation & safety tools.</p>
    </div>
    <div class="card card--inner">
      <div class="status" id="adminStatus">loading</div>
      <div class="row row--space">
        <div class="adminTabs" id="adminTabs">
        <button class="btn btn--ghost btn--small is-active" data-tab="post">Post Reports</button>
        <button class="btn btn--ghost btn--small" data-tab="comment">Comment Reports</button>
        <button class="btn btn--ghost btn--small" data-tab="users">User Management</button>
        </div>
        <button class="btn btn--ghost btn--small" id="adminRefresh" type="button">Refresh</button>
      </div>
      <div class="adminPanel" id="adminPanel"></div>
    </div>
  `;
  if (footer) {
    main.insertBefore(section, footer);
  } else {
    main.appendChild(section);
  }
}

let ADMIN_REFRESH_TIMER = null;
let ADMIN_REDIRECT_TIMER = null;

function clearAdminRefreshTimer() {
  if (ADMIN_REFRESH_TIMER) {
    clearInterval(ADMIN_REFRESH_TIMER);
    ADMIN_REFRESH_TIMER = null;
  }
}

function clearAdminState(message = "Not authorized.") {
  clearAdminRefreshTimer();
  if (ADMIN_REDIRECT_TIMER) {
    clearTimeout(ADMIN_REDIRECT_TIMER);
    ADMIN_REDIRECT_TIMER = null;
  }
  const panel = $("#adminPanel");
  const status = $("#adminStatus");
  if (status) status.textContent = "not authorized";
  if (panel) panel.innerHTML = `<div class="muted small">${message}</div>`;
}

function showNotAuthorizedAndRedirect() {
  clearAdminState(`Not authorized. Redirecting in 1s...`);
  ADMIN_REDIRECT_TIMER = setTimeout(() => {
    navigateToHome();
    ADMIN_REDIRECT_TIMER = null;
  }, 1000);
}

async function loadAdminPanel() {
  const panel = $("#adminPanel");
  const status = $("#adminStatus");
  if (!panel || !status) return;
  status.textContent = "loading";
  panel.innerHTML = "";

  if (!supabase) {
    status.textContent = "not authorized";
    panel.innerHTML = `<div class="muted small">Supabase is not set.</div>`;
    return;
  }

  try {
    const userResp = await supabase.auth.getUser();
    const uid = userResp?.data?.user?.id || null;
    if (!uid) {
      showNotAuthorizedAndRedirect();
      return;
    }

    const { data: roleRow, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr) throw roleErr;
    const isAdmin = roleRow?.role === "admin";
    if (!isAdmin) {
      showNotAuthorizedAndRedirect();
      return;
    }

    status.textContent = "authorized";
    renderAdminTab("post");

    $("#adminTabs")?.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("button[data-tab]");
      if (!btn) return;
      $$("#adminTabs button").forEach((b) => b.classList.toggle("is-active", b === btn));
      renderAdminTab(btn.dataset.tab || "post");
    });

    $("#adminRefresh")?.addEventListener("click", () => {
      const active = $("#adminTabs .is-active")?.dataset?.tab || "post";
      renderAdminTab(active);
      loadBanStatus();
    });

    if (!ADMIN_REFRESH_TIMER) {
      ADMIN_REFRESH_TIMER = setInterval(() => {
        const active = $("#adminTabs .is-active")?.dataset?.tab || "post";
        renderAdminTab(active);
      }, 10000);
    }
  } catch (err) {
    console.warn("[admin] Load failed.", err);
    status.textContent = "not authorized";
    panel.innerHTML = `<div class="muted small">Not authorized.</div>`;
  }
}

async function renderAdminTab(tab) {
  const panel = $("#adminPanel");
  if (!panel) return;
  if (tab === "users") {
    panel.innerHTML = `
      <div class="adminCard">
        <div class="label">User ID</div>
        <input class="input" id="banUserId" placeholder="uuid" />
        <div class="row">
          <button class="btn btn--ghost btn--small" data-action="ban-24h">Ban 24h</button>
          <button class="btn btn--ghost btn--small" data-action="ban-7d">Ban 7d</button>
          <button class="btn btn--ghost btn--small" data-action="ban-perm">Ban permanent</button>
          <button class="btn btn--ghost btn--small btn--danger" data-action="unban">Unban</button>
        </div>
      </div>
      <div class="adminCard">
        <div class="label">Active bans</div>
        <div class="adminBans" id="adminActiveBans"></div>
      </div>
    `;
    panel.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
      if (btn.dataset.disabled === "1") return;
        const userId = $("#banUserId")?.value?.trim();
        if (!userId) return;
        if (btn.dataset.action === "unban") {
          console.log("UNBAN CLICK", userId);
          await unbanUser(userId);
        } else {
          await banUser(userId, btn.dataset.action);
        }
      });
    });
    renderActiveBans();
    return;
  }

  if (tab === "comment") {
    const rows = await loadReportAggregates("comment_reports", "comment_id");
    panel.innerHTML = await renderReportsTable(rows, "comment");
    bindReportActions("comment");
    return;
  }

  const rows = await loadReportAggregates("post_reports", "post_id");
  panel.innerHTML = await renderReportsTable(rows, "post");
  bindReportActions("post");
}

async function loadReportAggregates(table, idCol) {
  if (!supabase) return [];
  try {
    const selectCols =
      table === "post_reports"
        ? `${idCol}, reporter_id, created_at, post_snapshot`
        : table === "comment_reports"
          ? `${idCol}, reporter_id, created_at, comment_snapshot`
        : `${idCol}, reporter_id, created_at`;
    const { data, error } = await supabase
      .from(table)
      .select(selectCols)
      .limit(500);
    if (error) throw error;
    const map = new Map();
    (data || []).forEach((row) => {
      const key = row[idCol];
      if (!map.has(key)) map.set(key, { reporters: new Set(), latest: null, snapshot: null });
      const entry = map.get(key);
      entry.reporters.add(row.reporter_id);
      if (table === "post_reports" && !entry.snapshot && row.post_snapshot) {
        entry.snapshot = row.post_snapshot;
      }
      if (table === "comment_reports" && !entry.snapshot && row.comment_snapshot) {
        entry.snapshot = row.comment_snapshot;
      }
      if (row.created_at) {
        const t = new Date(row.created_at).getTime();
        if (!Number.isFinite(t)) return;
        if (!entry.latest || t > entry.latest) entry.latest = t;
      }
    });
    return Array.from(map.entries())
      .map(([id, meta]) => ({
        id,
        count: meta.reporters.size,
        flagged: meta.reporters.size >= 3,
        latest_report_at: meta.latest ? new Date(meta.latest).toISOString() : null,
        snapshot: meta.snapshot,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        const ta = a.latest_report_at ? new Date(a.latest_report_at).getTime() : 0;
        const tb = b.latest_report_at ? new Date(b.latest_report_at).getTime() : 0;
        return tb - ta;
      });
  } catch (err) {
    console.warn("[admin] Failed to load reports.", err);
    return [];
  }
}

async function renderActiveBans() {
  const host = $("#adminActiveBans");
  if (!host) return;
  if (!supabase) {
    host.innerHTML = `<div class="muted small">Supabase is not set.</div>`;
    return;
  }
  host.innerHTML = `<div class="muted small">Loading...</div>`;
  try {
    const { data, error } = await supabase
      .from("user_bans")
      .select("user_id,banned_until,created_at,reason")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      host.innerHTML = `<div class="muted small">No active bans.</div>`;
      return;
    }
    host.innerHTML = rows
      .map((r) => {
        const until = r.banned_until ? new Date(r.banned_until).toLocaleString() : "Permanent";
        const since = r.created_at ? new Date(r.created_at).toLocaleString() : "-";
        return `
          <div class="adminBanRow" data-user-id="${escapeHtml(r.user_id || "")}">
            <div class="adminBanMeta">
              <div class="adminBanUser">${escapeHtml(r.user_id || "-")}</div>
              <div class="adminBanInfo">
                <span>Until: ${escapeHtml(until)}</span>
                <span>Since: ${escapeHtml(since)}</span>
              </div>
            </div>
            <div class="adminBanActions">
              <button class="btn btn--ghost btn--small btn--danger" data-action="unban">Unban</button>
            </div>
          </div>
        `;
      })
      .join("");
    host.querySelectorAll("[data-action='unban']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = btn.closest(".adminBanRow");
        const userId = row?.dataset?.userId?.trim();
        if (!userId) return;
        const input = $("#banUserId");
        if (input) input.value = userId;
        await unbanUser(userId);
        renderActiveBans();
      });
    });
  } catch (err) {
    console.warn("[admin] Active bans load failed.", err);
    host.innerHTML = `<div class="muted small">Failed to load active bans.</div>`;
  }
}

async function renderReportsTable(rows, kind) {
  if (!rows.length) {
    return `<div class="muted small">No reports.</div>`;
  }
  if (kind === "comment") {
    const ids = rows.map((r) => r.id).filter((x) => x);
    const commentMap = {};
    if (ids.length) {
      const { data } = await supabase
        .from("comments")
        .select("id,post_id,user_id,nickname,content,created_at")
        .in("id", ids);
      (data || []).forEach((c) => {
        commentMap[c.id] = {
          post_id: c.post_id,
          user_id: c.user_id,
          nickname: c.nickname || "Traveler",
          content: c.content || "",
          created_at: c.created_at,
        };
      });
    }
    return `
      <div class="adminTable adminTable--comment">
        <div class="adminTable__head">
          <span>Comment ID</span>
          <span>Post ID</span>
          <span>Reports</span>
          <span>Author</span>
          <span>Nickname</span>
          <span>Age</span>
          <span>Preview</span>
          <span>Actions</span>
        </div>
        ${rows
          .map((r) => {
            const hasComment = r.id && commentMap[r.id];
            const isMissing = !hasComment;
            const c = hasComment ? commentMap[r.id] : {};
            const snap = r.snapshot || {};
            const age = hasComment
              ? c?.created_at
                ? timeAgo(c.created_at)
                : "-"
              : snap?.created_at
                ? timeAgo(snap.created_at)
                : "-";
            const preview = hasComment
              ? escapeHtml(truncateText(c.content || "", 80) || "-")
              : escapeHtml(truncateText(snap?.content_preview || "", 120) || "-");
            const reportBadge =
              r.flagged
                ? `<span class="badge badge--danger">${r.count}</span>`
                : `<span class="badge badge--soft">${r.count}</span>`;
            return `
            <div class="adminTable__row ${r.flagged ? "is-flagged" : ""}" data-id="${r.id ?? ""}" data-missing="${isMissing ? "1" : "0"}">
              <span>${r.id ?? "Deleted comment"}</span>
              <span>${hasComment ? c.post_id ?? "-" : snap?.post_id ?? "-"}</span>
              <span>${reportBadge}</span>
              <span class="adminUserId">${hasComment ? c.user_id || "-" : "-"}</span>
              <span>${hasComment ? escapeHtml(c.nickname || "-") : escapeHtml(snap?.nickname || "-")}</span>
              <span>${age}</span>
              <span>${preview}</span>
              <span class="adminActions">
                <button class="btn btn--ghost btn--small ${isMissing ? "is-disabled" : ""}" data-action="quarantine" data-disabled="${isMissing ? "1" : "0"}">Quarantine</button>
                <button class="btn btn--ghost btn--small ${isMissing ? "is-disabled" : ""}" data-action="hide" data-disabled="${isMissing ? "1" : "0"}">Hide</button>
                <button class="btn btn--ghost btn--small ${isMissing ? "is-disabled" : ""}" data-action="restore" data-disabled="${isMissing ? "1" : "0"}">Restore</button>
                <button class="btn btn--ghost btn--small ${isMissing ? "is-disabled" : ""}" data-action="ban-24h" data-disabled="${isMissing ? "1" : "0"}">Ban 24h</button>
                <button class="btn btn--ghost btn--small" data-action="clear-reports">Clear reports</button>
              </span>
            </div>
          `;
          })
          .join("")}
      </div>
    `;
  }

  let authorMap = {};
  const ids = rows.map((r) => r.id).filter((x) => x);
  if (ids.length) {
    const { data } = await supabase
      .from("posts")
      .select("id,user_id,nickname,created_at")
      .in("id", ids);
    (data || []).forEach((p) => {
      authorMap[p.id] = {
        user_id: p.user_id,
        nickname: p.nickname || "Traveler",
        created_at: p.created_at,
      };
    });
  }
  return `
    <div class="adminTable adminTable--post">
      <div class="adminTable__head">
        <span>Post ID</span>
        <span>Reports</span>
        <span>Author</span>
        <span>Nickname</span>
        <span>Age</span>
        <span>Preview</span>
        <span>Actions</span>
      </div>
            ${rows
        .map((r) => {
          const author = authorMap[r.id] || {};
          const snap = r.snapshot || {};
          const isMissing = !r.id;
          const age = isMissing
            ? snap?.created_at
              ? timeAgo(snap.created_at)
              : "-"
            : author?.created_at
              ? timeAgo(author.created_at)
              : "-";
          const reportBadge =
            r.flagged
              ? `<span class="badge badge--danger">${r.count}</span>`
              : `<span class="badge badge--soft">${r.count}</span>`;
          const postLabel = isMissing ? "Deleted post" : r.id;
          const authorId = isMissing ? snap?.author_id || null : author.user_id || null;
          const nickname = isMissing ? snap?.nickname || "-" : author.nickname || "-";
          const preview = isMissing
            ? escapeHtml(truncateText(snap?.content_preview || "", 120) || "-")
            : "-";
          const canManageUser = !!authorId;
          return `
          <div class="adminTable__row ${r.flagged ? "is-flagged" : ""}" data-id="${r.id ?? ""}" data-missing="${isMissing ? "1" : "0"}">
            <span>${postLabel}</span>
            <span>${reportBadge}</span>
            <span class="adminUserId">${escapeHtml(authorId || "-")}</span>
            <span>${escapeHtml(nickname)}</span>
            <span>${age}</span>
            <span>${preview}</span>
            <span class="adminActions">
              ${
                canManageUser
                  ? `<button class="btn btn--ghost btn--small" data-action="copy-user">Copy user id</button>
              <button class="btn btn--ghost btn--small" data-action="ban-24h">Ban 24h</button>`
                  : ""
              }
              <button class="btn btn--ghost btn--small ${isMissing ? "is-disabled" : ""}" data-action="quarantine" data-disabled="${isMissing ? "1" : "0"}">Quarantine</button>
              <button class="btn btn--ghost btn--small ${isMissing ? "is-disabled" : ""}" data-action="hide" data-disabled="${isMissing ? "1" : "0"}">Hide</button>
              <button class="btn btn--ghost btn--small ${isMissing ? "is-disabled" : ""}" data-action="restore" data-disabled="${isMissing ? "1" : "0"}">Restore</button>
              <button class="btn btn--ghost btn--small" data-action="clear-reports">Clear reports</button>
            </span>
          </div>
        `;
        })
        .join("")}
    </div>
  `;
}

function bindReportActions(kind) {
  const panel = $("#adminPanel");
  if (!panel) return;
  panel.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.disabled === "1") return;
      const row = btn.closest(".adminTable__row");
      const action = btn.dataset.action;
      const id = row?.dataset?.id;
      const isMissing = row?.dataset?.missing === "1";
      if (!id) {
        if (action === "clear-reports" && isMissing) {
          // allow clearing grouped null reports
        } else {
          return;
        }
      }
      if (kind === "post") {
        if (action === "copy-user") {
          const userId = row.querySelector(".adminUserId")?.textContent?.trim();
          if (userId) {
            try {
              await navigator.clipboard.writeText(userId);
              toast("Copied");
            } catch (err) {
              console.warn("[admin] Clipboard failed.", err);
            }
          }
          return;
        }
        if (action === "ban-24h") {
          const userId = row.querySelector(".adminUserId")?.textContent?.trim();
          console.log("BAN CLICK", userId);
          if (!userId) {
            console.warn("No userId");
            return;
          }
          const input = $("#banUserId");
          if (input) input.value = userId;
          await banUser(userId, "ban-24h");
          return;
        }
        if (action === "clear-reports") {
          const ok = await clearPostReports(isMissing ? null : Number(id));
          if (ok) renderAdminTab("post");
          return;
        }
        if (action === "quarantine") await updateModerationStatus(Number(id), "quarantined");
        if (action === "hide") await updateModerationStatus(Number(id), "hidden", "Admin hidden");
        if (action === "restore") await updateModerationStatus(Number(id), "active");
      } else {
        if (action === "clear-reports") {
          const ok = await clearCommentReports(id ? Number(id) : null);
          if (ok) renderAdminTab("comment");
          return;
        }
        if (action === "ban-24h") {
          const userId = row.querySelector(".adminUserId")?.textContent?.trim();
          if (!userId) return;
          const ok = confirm("Ban this user for 24h?");
          if (!ok) return;
          await banUser(userId, "ban-24h");
          renderAdminTab("comment");
          return;
        }
        if (action === "quarantine") {
          const ok = await updateCommentModerationStatus(Number(id), "quarantined", null, "Quarantined");
          if (ok) renderAdminTab("comment");
        }
        if (action === "hide") {
          const ok = await updateCommentModerationStatus(
            Number(id),
            "hidden",
            "Admin hidden",
            "Hidden"
          );
          if (ok) renderAdminTab("comment");
        }
        if (action === "restore") {
          const ok = await updateCommentModerationStatus(Number(id), "active", null, "Restored");
          if (ok) renderAdminTab("comment");
        }
      }
    });
  });
}

async function clearPostReports(postId) {
  if (!supabase) return false;
  try {
    if (postId === null) {
      const { error } = await supabase.from("post_reports").delete().is("post_id", null);
      if (error) {
        toast(`${error.code || "ERR"} ${error.message || "Clear reports failed"}`);
        return false;
      }
      toast("Reports cleared");
      return true;
    }
    const pid = Number(postId);
    if (!Number.isFinite(pid)) return false;
    const { error } = await supabase.from("post_reports").delete().eq("post_id", pid);
    if (error) {
      toast(`${error.code || "ERR"} ${error.message || "Clear reports failed"}`);
      return false;
    }
    toast("Reports cleared");
    return true;
  } catch (err) {
    console.warn("[admin] Clear reports failed.", err);
    toast("Clear reports failed");
    return false;
  }
}

async function clearCommentReports(commentId) {
  if (!supabase) return false;
  try {
    if (commentId === null) {
      const { error } = await supabase.from("comment_reports").delete().is("comment_id", null);
      if (error) {
        toast(`${error.code || "ERR"} ${error.message || "Clear reports failed"}`);
        return false;
      }
      toast("Reports cleared");
      return true;
    }
    const cid = Number(commentId);
    if (!Number.isFinite(cid)) return false;
    const { error } = await supabase.from("comment_reports").delete().eq("comment_id", cid);
    if (error) {
      toast(`${error.code || "ERR"} ${error.message || "Clear reports failed"}`);
      return false;
    }
    toast("Reports cleared");
    return true;
  } catch (err) {
    console.warn("[admin] Clear comment reports failed.", err);
    toast("Clear reports failed");
    return false;
  }
}

async function updateCommentModerationStatus(commentId, status, reason = null, successToast = "Updated") {
  if (!supabase) return false;
  try {
    const cid = Number(commentId);
    if (!Number.isFinite(cid)) return false;
    const session = await getSession();
    const adminUid = session?.user?.id || null;
    const nowISO = new Date().toISOString();
    const payload = { moderation_status: status };
    if (status === "quarantined") {
      payload.quarantined_at = nowISO;
    }
    if (status === "hidden") {
      payload.hidden_at = nowISO;
      payload.hidden_reason = reason || "admin";
      payload.hidden_by = adminUid;
    }
    if (status === "active") {
      payload.quarantined_at = null;
      payload.hidden_at = null;
      payload.hidden_reason = null;
      payload.hidden_by = null;
    }
    const { error } = await supabase.from("comments").update(payload).eq("id", cid);
    if (error) {
      toast(`${error.code || "ERR"} ${error.message || "Update failed"}`);
      console.warn("[admin] Comment update failed.", error);
      return false;
    }
    toast(successToast);
    return true;
  } catch (err) {
    console.warn("[admin] Comment update failed.", err);
    toast("Update failed");
    return false;
  }
}

async function banUser(userId, action) {
  if (!supabase) return;
  try {
    const userResp = await supabase.auth.getUser();
    const adminId = userResp?.data?.user?.id || null;
    if (!adminId) {
      toast("Ban failed");
      return;
    }
    let bannedUntil = null;
    const now = Date.now();
    if (action === "ban-24h") bannedUntil = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    if (action === "ban-7d") bannedUntil = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    if (action === "ban-perm") bannedUntil = null;
    const payload = {
      user_id: userId.trim(),
      banned_until: bannedUntil,
      reason: "admin",
      created_by: adminId,
      status: "active",
      revoked_at: null,
      revoked_by: null,
      revoked_reason: null,
    };
    const { error: upsertErr } = await supabase
      .from("user_bans")
      .upsert(payload, { onConflict: "user_id" });
    if (upsertErr) {
      console.warn("[admin] Ban failed.", { code: upsertErr.code, message: upsertErr.message });
      toast("Ban failed");
      return;
    }
    toast("Banned");
  } catch (err) {
    console.warn("[admin] Ban failed.", err);
    toast("Ban failed");
  }
}

async function unbanUser(userId) {
  if (!supabase) return;

  const cleanId = (userId || "").trim();
  console.log("UNBAN CLICK", cleanId);

  if (!cleanId) {
    toast("Missing user id");
    return;
  }

  const adminResp = await supabase.auth.getUser();
  const adminId = adminResp?.data?.user?.id || null;
  if (!adminId) {
    toast("Unban failed");
    return;
  }

  const { data, error } = await supabase
    .from("user_bans")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: adminId,
      revoked_reason: "admin",
    })
    .eq("user_id", cleanId)
    .select();

  console.log("UNBAN RESULT", { dataLen: data?.length, error });

  if (error) {
    console.warn("[admin] Unban failed.", error);
    toast(`${error.code || "ERR"} ${error.message || "Unban failed"}`);
    return;
  }

  if (!data || data.length == 0) {
    toast("No ban row matched");
    return;
  }

  toast("Unbanned (revoked)");
  loadBanStatus();
  renderAdminTab("users");
}

async function updateModerationStatus(postId, status, reason = null) {
  if (!supabase) return;
  try {
    const pid = Number(postId);
    if (!Number.isFinite(pid)) {
      console.warn("[admin] Invalid post id.", postId);
      return;
    }
    const payload = { moderation_status: status };
    if (status === "quarantined") payload.quarantined_at = new Date().toISOString();
    if (status === "hidden") {
      payload.hidden_at = new Date().toISOString();
      payload.hidden_reason = reason;
    }
    if (status === "active") {
      payload.quarantined_at = null;
      payload.hidden_at = null;
      payload.hidden_reason = null;
    }
    const { data, error } = await supabase.from("posts").update(payload).eq("id", pid).select();
    if (error) {
      console.warn("[admin] Update failed.", { code: error.code, message: error.message });
      return;
    }
    console.log("[admin] Post updated:", data);
    renderAdminTab("post");
    loadCommunityPosts(true);
    toast("Community refreshed");
  } catch (err) {
    console.warn("[admin] Update failed.", err);
  }
}

export {
  ensureAdminUI,
  loadAdminPanel,
  clearAdminState,
  clearAdminRefreshTimer,
};
