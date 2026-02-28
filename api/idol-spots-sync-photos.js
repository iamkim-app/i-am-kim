import { createClient } from "@supabase/supabase-js";

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function getSupabaseEnv() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { url, anonKey, serviceKey };
}

function getSupabaseAdmin() {
  const { url, anonKey, serviceKey } = getSupabaseEnv();
  if (!url || !(serviceKey || anonKey)) return null;
  return createClient(url, serviceKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function fetchTextSearch(req, query) {
  const host = req.headers?.host || "localhost";
  const proto = req.headers?.["x-forwarded-proto"] || "http";
  const base = `${proto}://${host}`;
  const url = `${base}/api/places-textsearch?query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    const msg = data?.error || `Upstream ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Use POST" }));
    return;
  }

  try {
    const body = await readJson(req);
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    if (!ids.length) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Missing ids." }));
      return;
    }

    const sb = getSupabaseAdmin();
    if (!sb) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Supabase config missing." }));
      return;
    }

    const updated = [];
    const skipped = [];
    const failed = [];

    for (const id of ids) {
      try {
        const { data: row, error } = await sb
          .from("idol_spots")
          .select("id,map_query,place_name,english_address")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        if (!row) {
          skipped.push(id);
          continue;
        }

        const query =
          String(row.map_query || "").trim() ||
          [row.place_name, row.english_address].filter(Boolean).join(" ");
        if (!query) {
          skipped.push(id);
          continue;
        }

        const search = await fetchTextSearch(req, query);
        const placeId = search?.placeId || "";
        const photoRef = search?.photoRef || "";
        if (!placeId || !photoRef) {
          skipped.push(id);
          continue;
        }

        const imageUrl = `/api/places-photo?ref=${encodeURIComponent(photoRef)}&maxwidth=1200`;
        const { error: upErr } = await sb
          .from("idol_spots")
          .update({
            place_id: placeId,
            photo_ref: photoRef,
            image_url: imageUrl,
          })
          .eq("id", id);
        if (upErr) throw upErr;
        updated.push(id);
      } catch (err) {
        failed.push({ id, error: String(err?.message || err) });
      }
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, updated, skipped, failed }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: false,
        error: "Sync failed.",
        details: String(err?.message || err),
      })
    );
  }
}
