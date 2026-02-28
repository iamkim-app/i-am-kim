/**
 * GET /api/places/textsearch?query=
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Use GET" }));
    return;
  }

  const u = new URL(req.url, "http://localhost");
  const query = String((req.query && req.query.query) ?? u.searchParams.get("query") ?? "").trim();
  if (!query) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Missing query." }));
    return;
  }

  const key = (process.env.GOOGLE_PLACES_API_KEY || "").trim();
  if (!key) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Missing GOOGLE_PLACES_API_KEY." }));
    return;
  }

  const params = new URLSearchParams({
    query,
    key,
  });
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ok: false,
          error: "Places textsearch failed.",
          details: `${upstream.status} ${upstream.statusText || ""}`.trim(),
          upstream: text || undefined,
        })
      );
      return;
    }
    const data = await upstream.json();
    const first = (data?.results || [])[0] || null;
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        placeId: first?.place_id || "",
        name: first?.name || "",
        photoRef: first?.photos?.[0]?.photo_reference || "",
      })
    );
  } catch (err) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: false,
        error: "Places textsearch failed.",
        details: String(err?.message || err),
      })
    );
  }
}
