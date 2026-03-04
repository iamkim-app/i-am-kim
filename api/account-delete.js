import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function bearerToken(req) {
  const h = req.headers?.authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function getEnv(name, fallback = "") {
  return String(process.env[name] || fallback || "").trim();
}

function getSupabaseUrl() {
  return getEnv("SUPABASE_URL", getEnv("VITE_SUPABASE_URL"));
}

function getAnonKey() {
  return (
    getEnv("SUPABASE_ANON_KEY") ||
    getEnv("VITE_SUPABASE_ANON_KEY") ||
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}

function getServiceRoleKey() {
  return getEnv("SUPABASE_SERVICE_ROLE_KEY");
}

function getAdminClient() {
  const url = getSupabaseUrl();
  const serviceKey = getServiceRoleKey();
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function isMissingObjectError(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "").toLowerCase();
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("column") && msg.includes("does not exist")
  );
}

async function verifyAccessToken(token) {
  const url = getSupabaseUrl();
  const anonKey = getAnonKey();
  if (!url || !anonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  const res = await fetch(`${url}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.id) {
    return null;
  }
  return json;
}

async function runQuery(query, { optional = false } = {}) {
  const { error, data } = await query;
  if (error) {
    if (optional && isMissingObjectError(error)) return null;
    throw error;
  }
  return data ?? null;
}

async function selectIds(sb, table, filterColumn, filterValue) {
  const data = await runQuery(
    sb.from(table).select("id").eq(filterColumn, filterValue),
    { optional: true }
  );
  return Array.isArray(data) ? data.map((x) => x.id).filter(Boolean) : [];
}

async function selectIdsIn(sb, table, filterColumn, ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const data = await runQuery(
    sb.from(table).select("id").in(filterColumn, ids),
    { optional: true }
  );
  return Array.isArray(data) ? data.map((x) => x.id).filter(Boolean) : [];
}

async function deleteEq(sb, table, column, value, optional = false) {
  if (!value) return;
  await runQuery(sb.from(table).delete().eq(column, value), { optional });
}

async function deleteIn(sb, table, column, values, optional = false) {
  if (!Array.isArray(values) || !values.length) return;
  await runQuery(sb.from(table).delete().in(column, values), { optional });
}

async function deleteCommunityFiles(sb, userId) {
  const bucket = sb.storage.from("community");
  const prefix = `posts/${userId}`;
  const limit = 100;
  let offset = 0;

  while (true) {
    const { data, error } = await bucket.list(prefix, { limit, offset });
    if (error) throw error;
    if (!data || !data.length) break;

    const paths = data
      .map((item) => (item?.name ? `${prefix}/${item.name}` : ""))
      .filter(Boolean);

    if (paths.length) {
      const { error: delErr } = await bucket.remove(paths);
      if (delErr) throw delErr;
    }

    if (data.length < limit) break;
    offset += limit;
  }
}

async function deleteProfileRow(sb, uid) {
  // some apps use profiles.user_id, some use profiles.id
  const tryUserId = await sb.from("profiles").delete().eq("user_id", uid);
  if (!tryUserId.error) return;

  if (!isMissingObjectError(tryUserId.error)) {
    // user_id column exists but some other error -> fail
    throw tryUserId.error;
  }

  const tryId = await sb.from("profiles").delete().eq("id", uid);
  if (tryId.error && !isMissingObjectError(tryId.error)) {
    throw tryId.error;
  }
}

export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === "OPTIONS") {
      res.statusCode = 200;
      res.end("{}");
      return;
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, { ok: false, error: "Use POST" });
    }

    const token = bearerToken(req);
    if (!token) {
      return sendJson(res, 401, { ok: false, error: "Missing token" });
    }

    const admin = getAdminClient();
    if (!admin) {
      return sendJson(res, 500, {
        ok: false,
        error: "Server misconfigured",
      });
    }

    const user = await verifyAccessToken(token);
    if (!user?.id) {
      return sendJson(res, 401, { ok: false, error: "Invalid token" });
    }

    const uid = user.id;

    // collect owned content ids first (helps avoid FK issues)
    const postIds = await selectIds(admin, "posts", "user_id", uid);
    const ownCommentIds = await selectIds(admin, "comments", "user_id", uid);
    const commentsOnMyPosts = await selectIdsIn(admin, "comments", "post_id", postIds);
    const allCommentIds = Array.from(new Set([...ownCommentIds, ...commentsOnMyPosts]));

    // remove child/report/like rows first
    await deleteEq(admin, "post_likes", "user_id", uid, true);
    await deleteEq(admin, "post_reports", "reporter_id", uid, true);
    await deleteEq(admin, "comment_reports", "reporter_id", uid, true);

    await deleteIn(admin, "post_likes", "post_id", postIds, true);
    await deleteIn(admin, "post_reports", "post_id", postIds, true);
    await deleteIn(admin, "comment_reports", "comment_id", allCommentIds, true);

    // FAQ-related optional tables
    await deleteEq(admin, "faq_question_likes", "user_id", uid, true);
    await deleteEq(admin, "faq_answers", "user_id", uid, true);
    await deleteEq(admin, "faq_questions", "user_id", uid, true);

    // remove comments/posts
    await deleteEq(admin, "comments", "user_id", uid, true);
    await deleteIn(admin, "comments", "id", allCommentIds, true);
    await deleteEq(admin, "posts", "user_id", uid, true);

    // profile + roles
    await deleteProfileRow(admin, uid);
    await deleteEq(admin, "user_roles", "user_id", uid, true);
    await deleteEq(admin, "user_bans", "user_id", uid, true);

    // storage
    await deleteCommunityFiles(admin, uid).catch(() => {});

    // finally auth user
    const { error: authDelErr } = await admin.auth.admin.deleteUser(uid);
    if (authDelErr) throw authDelErr;

    return sendJson(res, 200, { ok: true });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: "Account delete failed",
      details: String(err?.message || err),
    });
  }
}