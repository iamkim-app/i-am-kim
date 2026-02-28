/**
 * GET /api/places/nearby?lat=&lng=&radius=&keyword=
 */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=86400");
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Use GET" }));
      return;
    }

    const urlObj = new URL(req.url, "http://localhost");
    const lat = Number(((req.query && req.query.lat) ?? urlObj.searchParams.get("lat") ?? ""));
    const lng = Number(((req.query && req.query.lng) ?? urlObj.searchParams.get("lng") ?? ""));
    const radiusRaw = Number(((req.query && req.query.radius) ?? urlObj.searchParams.get("radius") ?? ""));
    const keyword = String(((req.query && req.query.keyword) ?? urlObj.searchParams.get("keyword") ?? "")).trim();

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Missing lat/lng." }));
      return;
    }

    const radius = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : 1500;
    const key = (process.env.GOOGLE_PLACES_API_KEY || "").trim();
    if (!key) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Missing GOOGLE_PLACES_API_KEY." }));
      return;
    }

    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: String(radius),
      key,
    });
    if (keyword) params.set("keyword", keyword);

    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;

    const response = await fetch(url);
    if (!response.ok) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Places API failed." }));
      return;
    }
    const data = await response.json();
    const results = (data?.results || [])
      .slice(0, 8)
      .map((p) => ({
        placeId: p.place_id || "",
        name: p.name || "",
        vicinity: p.vicinity || "",
        lat: p?.geometry?.location?.lat ?? null,
        lng: p?.geometry?.location?.lng ?? null,
        rating: p?.rating ?? null,
        ratingsTotal: p?.user_ratings_total ?? null,
        openNow: p?.opening_hours?.open_now ?? null,
        photoRef: p?.photos?.[0]?.photo_reference ?? null,
      }));

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, results }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: false,
        error: "Places nearby failed",
        details: String(err?.message || err),
        stack: String(err?.stack || ""),
      })
    );
  }
}
