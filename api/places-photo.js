/**
 * GET /api/places/photo?ref=&maxwidth=
 */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Use GET" }));
    return;
  }

  const u = new URL(req.url, "http://localhost");
  const ref = String((req.query && req.query.ref) ?? u.searchParams.get("ref") ?? "").trim();
  const maxwidth = Number((req.query && req.query.maxwidth) ?? u.searchParams.get("maxwidth") ?? 800);
  if (!ref) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Missing ref." }));
    return;
  }

  const maxwidthSafe = Number.isFinite(maxwidth) && maxwidth > 0 ? maxwidth : 800;
  const key = (process.env.GOOGLE_PLACES_API_KEY || "").trim();
  if (!key) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Missing GOOGLE_PLACES_API_KEY." }));
    return;
  }

  const params = new URLSearchParams({
    maxwidth: String(maxwidthSafe),
    photo_reference: ref,
    key,
  });
  const url = `https://maps.googleapis.com/maps/api/place/photo?${params.toString()}`;

  const upstream = await fetch(url);
  if (!upstream.ok) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: false,
        error: "Places photo failed.",
        details: `Upstream ${upstream.status}`,
      })
    );
    return;
  }
  const contentType = upstream.headers.get("content-type") || "image/jpeg";
  res.setHeader("Content-Type", contentType);
  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.statusCode = 200;
  res.end(buffer);
}
