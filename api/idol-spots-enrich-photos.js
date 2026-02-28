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

function bearerToken(req) {
  const h = req.headers?.authorization || "";
  if (!h) return "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function getSupabaseEnv() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  return { url, anonKey };
}

function getSupabaseAsUser(token, authHeader = "") {
  const { url, anonKey } = getSupabaseEnv();
  if (!url || !anonKey) return null;
  const header = String(authHeader || "").trim() || `Bearer ${String(token || "").trim()}`;
  if (!/^Bearer\s+.+/i.test(header)) return null;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function isAdmin(sb) {
  if (!sb) return false;
  try {
    const { data: authData, error: authError } = await sb.auth.getUser();
    if (authError || !authData?.user?.id) return false;
    const { data: roleRow, error } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (error) return false;
    return roleRow?.role === "admin";
  } catch {
    return false;
  }
}

async function placesTextSearch(query, key) {
  const params = new URLSearchParams({ query, key });
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstream ${res.status} ${res.statusText || ""} ${text}`.trim());
  }
  const data = await res.json();
  return (data?.results || [])[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Use POST" }));
    return;
  }

  try {
    await readJson(req).catch(() => ({}));

    const key = (process.env.GOOGLE_PLACES_API_KEY || "").trim();
    if (!key) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Missing GOOGLE_PLACES_API_KEY." }));
      return;
    }

    const token = bearerToken(req);
    const sb = getSupabaseAsUser(token);
    if (!sb) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Unauthorized." }));
      return;
    }

    const okAdmin = await isAdmin(sb);
    if (!okAdmin) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Admin only." }));
      return;
    }

    const { data: rows, error } = await sb
      .from("idol_spots")
      .select("id,map_query,restaurant_name,address_en")
      .is("photo_ref", null)
      .limit(10);
    if (error) throw error;

    const failed = [];
    let updated = 0;

    for (const row of rows || []) {
      try {
        const query =
          String(row.map_query || "").trim() ||
          [row.restaurant_name, row.address_en].filter(Boolean).join(" ");
        if (!query) {
          failed.push({ id: row.id, error: "Missing query" });
          continue;
        }

        const result = await placesTextSearch(query, key);
        if (!result?.place_id || !result?.photos?.[0]?.photo_reference) {
          failed.push({ id: row.id, error: "No photo result" });
          continue;
        }

        const photoRef = result.photos[0].photo_reference;
        const imageUrl = `/api/places-photo?ref=${encodeURIComponent(photoRef)}&maxwidth=1000`;
        const { error: upErr } = await sb
          .from("idol_spots")
          .update({
            place_id: result.place_id,
            photo_ref: photoRef,
            image_url: imageUrl,
          })
          .eq("id", row.id);
        if (upErr) throw upErr;
        updated += 1;
      } catch (err) {
        failed.push({ id: row.id, error: String(err?.message || err) });
      }
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, updated, failed }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: false,
        error: "Enrich failed.",
        details: String(err?.message || err),
      })
    );
  }
}
