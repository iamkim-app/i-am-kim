import { AUTH_STATE, getSession, displayNameFromSession } from "./auth.js";

const {
  $,
  $$,
  supabase,
  toast,
  escapeHtml,
  truncateText,
  normalizeAvatar,
  defaultAvatar,
  avatarSrc,
  PROFILE_STATE,
  setNicknameBannerVisible,
} = window.App;

/* ----------------------------- COMMENT REPORT MODAL --------------------- */

let COMMENT_REPORT_RESOLVE = null;
let COMMENT_REPORT_OPEN = false;

function ensureCommentReportModal() {
  if ($("#commentReportModal")) return;
  const el = document.createElement("div");
  el.className = "modal";
  el.id = "commentReportModal";
  el.hidden = true;
  el.innerHTML = `
    <div class="modal__backdrop" data-close="1"></div>
    <div class="modal__card reportModal">
      <div class="modal__head">
        <div class="modal__title">Report comment</div>
        <button class="btn btn--ghost btn--small" data-close="1" type="button">Close</button>
      </div>
      <div class="muted small">Select a reason before sending.</div>
      <div class="reportOptions" role="radiogroup" aria-label="Report reason">
        ${["Spam", "Scam", "Offensive", "Other"]
          .map(
            (r, idx) => `
          <label class="reportOption">
            <input type="radio" name="comment-report-reason" value="${r}" ${idx === 0 ? "checked" : ""} />
            <span>${r}</span>
          </label>
        `
          )
          .join("")}
      </div>
      <div class="reportActions">
        <button class="btn btn--ghost btn--small" data-close="1" type="button">Cancel</button>
        <button class="btn btn--primary btn--small" id="commentReportSubmit" type="button">Report</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  el.addEventListener("click", (e) => {
    if (e.target?.closest?.("[data-close='1']")) {
      closeCommentReportModal(null);
    }
  });

  $("#commentReportSubmit")?.addEventListener("click", () => {
    const picked = el.querySelector("input[name='comment-report-reason']:checked");
    const reason = String(picked?.value || "").trim();
    closeCommentReportModal(reason || null);
  });
}

function openCommentReportModal() {
  ensureCommentReportModal();
  const modal = $("#commentReportModal");
  if (!modal) return Promise.resolve(null);
  if (COMMENT_REPORT_OPEN) return Promise.resolve(null);
  COMMENT_REPORT_OPEN = true;
  modal.hidden = false;
  return new Promise((resolve) => {
    COMMENT_REPORT_RESOLVE = resolve;
  });
}

function closeCommentReportModal(reason) {
  const modal = $("#commentReportModal");
  if (modal) modal.hidden = true;
  COMMENT_REPORT_OPEN = false;
  const resolve = COMMENT_REPORT_RESOLVE;
  COMMENT_REPORT_RESOLVE = null;
  if (resolve) resolve(reason || null);
}

/* ----------------------------- COMMUNITY ------------------------------- */

let COMMUNITY_FILTER = "all";
let COMMUNITY_LOADING = false;
const ADMIN_USER_IDS = [];

function categoryPill(cat) {
  const c = String(cat || "Tips");
  const label = escapeHtml(c);
  return `<span class="nowTag">${label}</span>`;
}

function isAdminUser(session) {
  const role = session?.user?.app_metadata?.role || session?.user?.role || "";
  return role === "admin" || ADMIN_USER_IDS.includes(session?.user?.id);
}

function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(mo / 12);
  return `${y}y ago`;
}

function renderCommunityFeed(posts, currentUserId, likeCounts = {}, myLikes = new Set(), commentsMap = {}) {
  const feed = $("#communityFeed");
  if (!feed) return;

  const list = Array.isArray(posts) ? posts : [];
  if (!list.length) {
    feed.innerHTML = `<div class="muted small">No posts yet. Be the first to share a tip.</div>`;
    return;
  }

  feed.innerHTML = list
    .map((p) => {
      const name = escapeHtml(p.nickname || "Traveler");
      const rawContent = String(p.content || "");
      const firstLine = rawContent.split("\n")[0] || "";
      const title = escapeHtml(firstLine);
      const body = escapeHtml(rawContent);
      const cat = p.category || "Tips";
      const when = timeAgo(p.created_at);
      const isMine = currentUserId && p.user_id === currentUserId;
      const likeCount = Number(likeCounts[p.id] || 0);
      const liked = myLikes.has(p.id);
      const comments = commentsMap[p.id] || [];
      const canInteract = !!currentUserId && !AUTH_STATE.isBanned && !AUTH_STATE.banLoading;
      const canReportComment = !!currentUserId && !AUTH_STATE.isBanned && !AUTH_STATE.banLoading;
      const commentsHtml = comments
        .map((c) => {
          const cname = escapeHtml(c.nickname || "Traveler");
          const cbody = escapeHtml(c.content || "");
          const cpreset = normalizeAvatar(c.avatar || defaultAvatar()).preset;
          const cav = `<img src="${escapeHtml(avatarSrc(cpreset))}" alt="" />`;
          const canDelete = currentUserId && c.user_id === currentUserId;
          return `
          <div class="commentItem" data-id="${c.id}">
            <div class="commentAvatar">${cav}</div>
            <div class="commentBody">
              <div class="commentMeta">
                <span class="commentName">${cname}</span>
                <span class="commentTime">${timeAgo(c.created_at)}</span>
              </div>
              <div class="commentText">${cbody}</div>
            </div>
            <div class="commentActions">
              <button class="btn btn--ghost btn--small ${canReportComment ? "" : "is-disabled"}" data-action="report-comment" data-comment-id="${c.id}" type="button" data-disabled="${canReportComment ? "0" : "1"}" style="${canReportComment ? "" : "opacity:0.5"}">Report</button>
              ${canDelete ? `<button class="btn btn--ghost btn--small btn--danger" data-action="delete-comment" type="button">Delete</button>` : ""}
            </div>
          </div>
        `;
        })
        .join("");

      const preset = normalizeAvatar(p.avatar || defaultAvatar()).preset;
      const avatar = preset
        ? `<img src="${escapeHtml(avatarSrc(preset))}" alt="" />`
        : `<span>${escapeHtml(name.slice(0, 1).toUpperCase())}</span>`;

      const img = (p.image_url || "").trim();
      const imgBlock = img
        ? `<div class="postImage"><img src="${escapeHtml(img)}" alt="Post photo" loading="lazy" /></div>`
        : "";

      return `
      <article class="postCard" data-id="${p.id}">
        <div class="postHead">
          <div class="postUser">
            <div class="avatar">${avatar}</div>
            <div class="postUser__text">
              <div class="postUser__name">${name}</div>
              <div class="postUser__meta">
                ${categoryPill(cat)}
                ${when ? `<span>${escapeHtml(when)}</span>` : ""}
              </div>
            </div>
          </div>

        <div class="postActions">
          <button class="btn btn--ghost btn--small ${canInteract ? "" : "is-disabled"}" data-action="report" type="button" data-disabled="${canInteract ? "0" : "1"}" style="${canInteract ? "" : "opacity:0.5"}">Report</button>
          ${isMine ? `<button class="btn btn--ghost btn--small btn--danger" data-action="delete" type="button">Delete</button>` : ""}
        </div>
        </div>

        ${title ? `<h3 class="postTitle">${title}</h3>` : ""}
        ${body ? `<div class="postBody">${body}</div>` : ""}
        ${imgBlock}

        <div class="postActions">
          <button class="btn btn--ghost btn--small ${liked ? "is-active" : ""} ${canInteract ? "" : "is-disabled"}" data-action="like" type="button" data-disabled="${canInteract ? "0" : "1"}" style="${canInteract ? "" : "opacity:0.5"}">
            ${liked ? "Liked" : "Like"} ${likeCount}
          </button>
        </div>

        <div class="comments">
          <div class="commentsHead">Comments</div>
          <div class="commentsList">
            ${commentsHtml || `<div class="muted small">No comments yet.</div>`}
          </div>
          <div class="commentForm">
            <textarea class="textarea commentInput" rows="2" placeholder="Write a comment..." ${canInteract ? "" : "disabled"}></textarea>
            <button class="btn btn--primary btn--small ${canInteract ? "" : "is-disabled"}" data-action="send-comment" type="button" ${canInteract ? "" : ""} data-disabled="${canInteract ? "0" : "1"}">Send</button>
          </div>
          ${canInteract ? "" : `<div class="muted small">${AUTH_STATE.isBanned ? "Account suspended." : "Please sign in to comment."}</div>`}
        </div>
      </article>
    `;
    })
    .join("");

  // bind actions
  feed.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = btn.closest(".postCard");
      const id = Number(card?.dataset?.id);
      const action = btn.dataset.action;
      if (!id || !action) return;

      if (action === "delete") {
        await deletePost(id);
      } else if (action === "report") {
        if (btn.dataset.disabled === "1") {
          toast("Account suspended.");
          return;
        }
        await reportPost(id);
      } else if (action === "like") {
        if (btn.dataset.disabled === "1") {
          toast("Account suspended.");
          return;
        }
        await toggleLike(id);
      } else if (action === "send-comment") {
        if (btn.dataset.disabled === "1") {
          toast("Account suspended.");
          return;
        }
        const input = card?.querySelector(".commentInput");
        const content = String(input?.value || "").trim();
        if (!content) return;
        await createComment(id, content);
        if (input) input.value = "";
      } else if (action === "delete-comment") {
        const commentId = Number(btn.closest(".commentItem")?.dataset?.id);
        if (Number.isFinite(commentId)) {
          await deleteComment(commentId);
        }
      } else if (action === "report-comment") {
        if (btn.dataset.disabled === "1") {
          if (AUTH_STATE.isBanned) toast("Account suspended.");
          else toast("Please sign in to report.");
          return;
        }
        const commentId = Number(btn.dataset.commentId || btn.closest(".commentItem")?.dataset?.id);
        if (Number.isFinite(commentId)) {
          await reportComment(commentId);
        }
      }
    });
  });
}

async function loadCommunityPosts(forceReload) {
  if (COMMUNITY_LOADING) return;
  COMMUNITY_LOADING = true;

  const status = $("#communityStatus");
  if (status) status.textContent = "Loading...";

  try {
    if (!supabase) {
      if (status) status.textContent = "Supabase is not set (demo mode).";
      renderCommunityFeed([], null);
      COMMUNITY_LOADING = false;
      return;
    }

    const session = await getSession();
    const currentUserId = session?.user?.id || null;

    let q = supabase
      .from("posts")
      .select("id,user_id,nickname,avatar,category,content,image_url,image_path,created_at,moderation_status")
      .order("created_at", { ascending: false })
      .limit(50);

    if (COMMUNITY_FILTER !== "all") q = q.eq("category", COMMUNITY_FILTER);
    q = q.eq("moderation_status", "active");

    const { data, error } = await q;
    if (error) throw error;

    const posts = data || [];
    const likeInfo = await loadCommunityLikes(posts.map((p) => p.id), currentUserId);
    const commentsMap = await loadCommunityComments(posts.map((p) => p.id));

    if (status) status.textContent = "";
    renderCommunityFeed(posts, currentUserId, likeInfo.counts, likeInfo.myLikes, commentsMap);
  } catch (err) {
    if (status) status.textContent = `Error: ${err?.message || err}`;
    renderCommunityFeed([], null);
  } finally {
    COMMUNITY_LOADING = false;
  }
}

async function loadCommunityLikes(postIds, currentUserId) {
  const result = { counts: {}, myLikes: new Set() };
  if (!supabase || !postIds.length) return result;
  try {
    const { data, error } = await supabase
      .from("post_likes")
      .select("post_id,user_id")
      .in("post_id", postIds);
    if (error) throw error;
    (data || []).forEach((row) => {
      const pid = Number(row?.post_id);
      if (!Number.isFinite(pid)) return;
      result.counts[pid] = (result.counts[pid] || 0) + 1;
      if (currentUserId && row?.user_id === currentUserId) result.myLikes.add(pid);
    });
  } catch (err) {
    console.warn("[community] Failed to load likes.", err);
  }
  return result;
}

async function loadCommunityComments(postIds) {
  const map = {};
  if (!supabase || !postIds.length) return map;
  try {
    const { data, error } = await supabase
      .from("comments")
      .select("id,post_id,user_id,nickname,avatar,content,created_at,moderation_status")
      .in("post_id", postIds)
      .eq("moderation_status", "active")
      .order("created_at", { ascending: true });
    if (error) throw error;
    (data || []).forEach((c) => {
      const pid = Number(c.post_id);
      if (!Number.isFinite(pid)) return;
      if (!map[pid]) map[pid] = [];
      map[pid].push(c);
    });
    Object.keys(map).forEach((pid) => {
      const list = map[pid];
      if (list.length > 10) {
        map[pid] = list.slice(-10);
      }
    });
  } catch (err) {
    console.warn("[community] Failed to load comments.", err);
  }
  return map;
}

/* ---------- Community: modal ---------- */

function openModal() {
  if (PROFILE_STATE.needsNickname) {
    setNicknameBannerVisible(true);
    toast("Set your nickname to continue.");
    return;
  }
  const m = $("#postModal");
  if (!m) return;
  m.hidden = false;
  $("#postModalStatus").textContent = "";
  $("#postBody").value = "";
  $("#postCategory").value = "Tips";
  $("#postPhoto").value = "";
  const prev = $("#postPhotoPreview");
  prev.hidden = true;
  prev.innerHTML = "";
}

function closeModal() {
  const m = $("#postModal");
  if (!m) return;
  m.hidden = true;
}

async function uploadOneImage(file, userId) {
  // returns { publicUrl, path }
  const bucket = "community";
  const maxBytes = 2 * 1024 * 1024;

  if (!file) return { publicUrl: "", path: "" };
  if (file.size > maxBytes) throw new Error("Image too large (max 2MB).");
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) throw new Error("Unsupported image type.");

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 8);
  const path = `posts/${userId}/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "image/jpeg",
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { publicUrl: data?.publicUrl || "", path };
}

async function compressImage(file) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!file || !allowed.includes(file.type)) throw new Error("Unsupported image type.");

  const maxDim = 1600;
  let width = 0;
  let height = 0;
  let bitmap = null;
  let img = null;
  let objectUrl = "";

  try {
    if ("createImageBitmap" in window) {
      bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
    } else {
      objectUrl = URL.createObjectURL(file);
      img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = objectUrl;
      });
      width = img.naturalWidth || img.width;
      height = img.naturalHeight || img.height;
    }

    if (!width || !height) throw new Error("Invalid image.");

    const scale = Math.min(1, maxDim / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable.");

    if (bitmap) {
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
      bitmap.close?.();
    } else if (img) {
      ctx.drawImage(img, 0, 0, targetW, targetH);
    }

    const qualities = [0.8, 0.7, 0.6, 0.5];
    const maxBytes = 2 * 1024 * 1024;

    const toBlob = (q) =>
      new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed."))),
          "image/jpeg",
          q
        );
      });

    let lastBlob = null;
    for (const q of qualities) {
      const blob = await toBlob(q);
      lastBlob = blob;
      if (blob.size <= maxBytes) {
        const base = (file.name || "photo").replace(/\.[^/.]+$/, "");
        return { blob, fileName: `${base || "photo"}.jpg` };
      }
    }

    if (lastBlob) {
      throw new Error("Compressed image still too large.");
    }
    throw new Error("Compression failed.");
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

async function createPost({ category, body, imageUrl, imagePath }) {
  const session = await getSession();
  if (!session) throw new Error("Please sign in first.");
  if (AUTH_STATE.isBanned) throw new Error("Account suspended.");

  const userId = session.user.id;
  const nickname = PROFILE_STATE.nickname || displayNameFromSession(session);
  const avatar = normalizeAvatar(PROFILE_STATE.avatar || defaultAvatar());

  const payload = {
    user_id: userId,
    nickname,
    avatar,
    category,
    content: body,
    image_url: imageUrl || null,
    image_path: imagePath || null,
  };

  const { error } = await supabase.from("posts").insert(payload);
  if (error) throw error;
}

async function deletePost(postId) {
  if (!supabase) return;

  const session = await getSession();
  if (!session) {
    toast("Sign in to delete.");
    return;
  }

  const ok = confirm("Delete this post?");
  if (!ok) return;

  // Try to fetch image_path first for cleanup
  const { data: found } = await supabase
    .from("posts")
    .select("id,image_path")
    .eq("id", postId)
    .maybeSingle();

  const path = found?.image_path;
  if (path) {
    const { error: storageErr } = await supabase.storage.from("community").remove([path]);
    if (storageErr) {
      console.warn("[community] Failed to delete image.", storageErr);
      toast("Failed to delete image.");
      // Continue to delete post row anyway
    }
  }

  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", postId);

  if (error) {
    toast(`${error.code || "ERR"} ${error.message || "Delete failed"}`);
    return;
  }

  toast("Deleted");
  loadCommunityPosts(true);
}

async function reportPost(postId) {
  if (!supabase) return;

  const session = await getSession();
  if (!session) {
    toast("Sign in to report.");
    return;
  }
  if (AUTH_STATE.isBanned) {
    toast("Account suspended.");
    return;
  }

  let postSnapshot = null;
  try {
    const { data: postRow, error: postErr } = await supabase
      .from("posts")
      .select("id,user_id,nickname,content,created_at")
      .eq("id", postId)
      .maybeSingle();
    if (!postErr && postRow) {
      const content = String(postRow.content || "");
      postSnapshot = {
        post_id: postRow.id,
        author_id: postRow.user_id,
        nickname: postRow.nickname || "Traveler",
        content_preview: content.slice(0, 120),
        created_at: postRow.created_at || null,
      };
    }
  } catch (err) {
    console.warn("[community] Snapshot load failed.", err);
  }

  const reason = prompt("Report reason? (Spam/Scam/Offensive/Other)", "Spam");
  if (!reason) return;
  const cleaned = String(reason).trim();
  const allowed = ["Spam", "Scam", "Offensive", "Other"];
  const finalReason = allowed.includes(cleaned) ? cleaned : "Other";
  try {
    const { error } = await supabase.from("post_reports").insert({
      post_id: postId,
      reporter_id: session.user.id,
      reason: finalReason,
      post_snapshot: postSnapshot,
    });
    if (error) {
      // unique constraint -> already reported
      if (String(error?.message || "").toLowerCase().includes("duplicate")) {
        toast("Already reported");
        return;
      }
      throw error;
    }

    // Count distinct reporters
    const { data: reporters, error: countErr } = await supabase
      .from("post_reports")
      .select("reporter_id")
      .eq("post_id", postId);
    if (countErr) throw countErr;
    const reporterCount = new Set((reporters || []).map((r) => r.reporter_id)).size;
    if (reporterCount >= 3) {
      const { error: modErr } = await supabase
        .from("posts")
        .update({ moderation_status: "quarantined", quarantined_at: new Date().toISOString() })
        .eq("id", postId);
      if (modErr) console.warn("[community] Failed to quarantine.", modErr);
      if (!modErr) loadCommunityPosts(true);
    }
  } catch (err) {
    console.warn("[community] Report failed.", err);
    toast("Failed to report.");
    return;
  }

  toast("Reported. Thanks.");
  loadCommunityPosts(true);
}

async function reportComment(commentId) {
  if (!supabase) return;
  const session = await getSession();
  if (!session) {
    toast("Please sign in to report.");
    return;
  }
  if (AUTH_STATE.isBanned) {
    toast("Account suspended.");
    return;
  }

  let commentSnapshot = null;
  try {
    const { data: commentRow, error: commentErr } = await supabase
      .from("comments")
      .select("id,post_id,user_id,nickname,avatar,content,created_at")
      .eq("id", commentId)
      .maybeSingle();
    if (!commentErr && commentRow) {
      const content = String(commentRow.content || "");
      commentSnapshot = {
        comment_id: commentRow.id,
        post_id: commentRow.post_id,
        author_id: commentRow.user_id,
        nickname: commentRow.nickname || "Traveler",
        avatar: commentRow.avatar || null,
        content_preview: content.slice(0, 120),
        created_at: commentRow.created_at || null,
      };
    }
  } catch (err) {
    console.warn("[community] Comment snapshot load failed.", err);
  }

  const reason = await openCommentReportModal();
  if (!reason) return;
  const allowed = ["Spam", "Scam", "Offensive", "Other"];
  const finalReason = allowed.includes(reason) ? reason : "Other";

  try {
    const { error } = await supabase.from("comment_reports").insert({
      comment_id: commentId,
      reporter_id: session.user.id,
      reason: finalReason,
      comment_snapshot: commentSnapshot,
    });
    if (error) {
      if (String(error?.message || "").toLowerCase().includes("duplicate")) {
        toast("Already reported");
        return;
      }
      toast(`${error.code || "ERR"} ${error.message || "Report failed"}`);
      return;
    }
    toast("Reported. Thanks.");
  } catch (err) {
    console.warn("[community] Comment report failed.", err);
    toast("Failed to report.");
  }
}

async function toggleLike(postId) {
  if (!supabase) return;
  const session = await getSession();
  if (!session) {
    toast("Please sign in");
    return;
  }
  if (AUTH_STATE.isBanned) {
    toast("Account suspended.");
    return;
  }
  const pid = Number(postId);
  if (!Number.isFinite(pid)) {
    console.warn("[community] Like failed: invalid post_id", postId);
    toast("Failed to update like.");
    return;
  }
  try {
    const { data, error } = await supabase
      .from("post_likes")
      .select("post_id,user_id")
      .eq("post_id", pid)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) throw error;

    if (data?.post_id) {
      const { error: delErr } = await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", pid)
        .eq("user_id", session.user.id);
      if (delErr) throw delErr;
    } else {
      const { error: insErr } = await supabase
        .from("post_likes")
        .insert({ post_id: pid, user_id: session.user.id });
      if (insErr) throw insErr;
    }
    loadCommunityPosts(true);
  } catch (err) {
    console.warn("[community] Like failed.", { error: err, postId: pid, userId: session.user.id });
    toast("Failed to update like.");
  }
}

async function isUserBanned(userId) {
  if (!supabase || !userId) return false;
  try {
    const { data, error } = await supabase
      .from("user_bans")
      .select("banned_until,status")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status !== "active") return false;
    if (!data?.banned_until) return false;
    return new Date(data.banned_until).getTime() > Date.now();
  } catch (err) {
    console.warn("[community] Ban check failed.", err);
    return false;
  }
}

async function createComment(postId, content) {
  if (!supabase) return;
  const session = await getSession();
  if (!session) {
    toast("Please sign in");
    return;
  }
  if (AUTH_STATE.isBanned) {
    toast("Account suspended.");
    return;
  }
  try {
    const payload = {
      post_id: Number(postId),
      user_id: session.user.id,
      nickname: PROFILE_STATE.nickname || displayNameFromSession(session),
      avatar: normalizeAvatar(PROFILE_STATE.avatar || defaultAvatar()),
      content: String(content || "").trim(),
    };
    const { error } = await supabase.from("comments").insert(payload);
    if (error) throw error;
    loadCommunityPosts(true);
  } catch (err) {
    console.warn("[community] Comment failed.", err);
    toast("Failed to comment.");
  }
}

async function deleteComment(commentId) {
  if (!supabase) return;
  const session = await getSession();
  if (!session) return;
  try {
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", Number(commentId))
      .eq("user_id", session.user.id);
    if (error) throw error;
    loadCommunityPosts(true);
  } catch (err) {
    console.warn("[community] Delete comment failed.", err);
    toast("Failed to delete comment.");
  }
}

function setupCommunity() {
  const page = $("#page-community");
  if (page && !$("#communityBanBanner")) {
    const ban = document.createElement("div");
    ban.id = "communityBanBanner";
    ban.className = "callout";
    ban.style.display = "none";
    page.insertBefore(ban, page.firstChild);
  }
  const newPostBtn = $("#btnNewPost");
  if (newPostBtn && !$("#communityBanHint")) {
    const hint = document.createElement("span");
    hint.id = "communityBanHint";
    hint.className = "muted small";
    hint.style.display = "none";
    newPostBtn.insertAdjacentElement("afterend", hint);
  }

  // filters
  $("#communityFilters")?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-filter]");
    if (!btn) return;

    const f = String(btn.dataset.filter || "all");
    COMMUNITY_FILTER = f;

    $$("#communityFilters .chip--filter").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.filter === f)
    );

    loadCommunityPosts(true);
  });

  // open modal
  $("#btnNewPost")?.addEventListener("click", (e) => {
    if (AUTH_STATE.isBanned || AUTH_STATE.banLoading) {
      toast("Account suspended.");
      return;
    }
    openModal();
  });
  $("#fabNewPost")?.addEventListener("click", () => {
    if (AUTH_STATE.isBanned || AUTH_STATE.banLoading) {
      toast("Account suspended.");
      return;
    }
    openModal();
  });

  // close modal
  $("#postModal")?.addEventListener("click", (e) => {
    const close = e.target?.closest?.("[data-close='1']");
    if (close) closeModal();
  });

  // preview image
  $("#postPhoto")?.addEventListener("change", (e) => {
    if (AUTH_STATE.isBanned) {
      toast("Account suspended.");
      e.target.value = "";
      return;
    }
    const file = e.target.files && e.target.files[0];
    const prev = $("#postPhotoPreview");
    if (!prev) return;

    if (!file) {
      prev.hidden = true;
      prev.innerHTML = "";
      return;
    }

    const url = URL.createObjectURL(file);
    prev.hidden = false;
    prev.innerHTML = `<img src="${escapeHtml(url)}" alt="Preview" />`;
  });

  // submit post
  $("#postForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const status = $("#postModalStatus");
    status.textContent = "";

    if (PROFILE_STATE.needsNickname) {
      status.textContent = "Set your nickname to continue.";
      setNicknameBannerVisible(true);
      return;
    }
    if (AUTH_STATE.isBanned) {
      status.textContent = "Account suspended.";
      return;
    }

    if (!supabase) {
      status.textContent = "Supabase is not set yet.";
      return;
    }

    const session = await getSession();
    if (!session) {
      status.textContent = "Please sign in first.";
      return;
    }

    const category = ($("#postCategory")?.value || "Tips").trim();
    const body = ($("#postBody")?.value || "").trim();
    const file = $("#postPhoto")?.files?.[0] || null;

    if (!body) {
      status.textContent = "Please write a message.";
      return;
    }

    status.textContent = "Posting...";

    try {
      let imageUrl = "";
      let imagePath = "";

      if (file) {
        status.textContent = "Compressing photo...";
        let uploadFile = file;
        try {
          const compressed = await compressImage(file);
          uploadFile = new File([compressed.blob], compressed.fileName, {
            type: "image/jpeg",
          });
        } catch (err) {
          const maxBytes = 2 * 1024 * 1024;
          if (file.size <= maxBytes) {
            uploadFile = file;
          } else {
            throw new Error("Photo too large. Please choose a smaller image.");
          }
        }

        status.textContent = "Uploading image...";
        const uploaded = await uploadOneImage(uploadFile, session.user.id);
        imageUrl = uploaded.publicUrl;
        imagePath = uploaded.path;
      }

      status.textContent = "Posting...";
      await createPost({ category, body, imageUrl, imagePath });

      status.textContent = "Posted.";
      closeModal();
      toast("Posted");
      loadCommunityPosts(true);
    } catch (err) {
      status.textContent = `Error: ${err?.message || err}`;
    }
  });
}

export {
  ensureCommentReportModal,
  openCommentReportModal,
  setupCommunity,
  loadCommunityPosts,
  timeAgo,
};
