/**
 * GET /api/places-nearby?lat=&lng=&radius=&keyword=&type=
 */

const ALLOWED_QUERY_TYPES = new Set(["restaurant", "cafe", "meal_takeaway"]);

const RESULT_ALLOWLIST = new Set(["restaurant", "food", "meal_takeaway", "meal_delivery"]);

const RESULT_BLOCKLIST = new Set([
  "locality",
  "political",
  "lodging",
  "route",
  "premise",
  "subpremise",
  "street_address",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "bank",
  "finance",
  "government_office",
  "apartment",
  "real_estate_agency",
]);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function firstValue(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function getParam(req, urlObj, key) {
  const fromQuery = String(firstValue(req?.query?.[key]) || "").trim();
  if (fromQuery) return fromQuery;
  return String(urlObj.searchParams.get(key) || "").trim();
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeType(value) {
  const t = String(value || "").trim().toLowerCase();
  return ALLOWED_QUERY_TYPES.has(t) ? t : "restaurant";
}

function hasBlockedType(place) {
  const types = Array.isArray(place?.types) ? place.types : [];
  return types.some((t) => RESULT_BLOCKLIST.has(String(t || "").toLowerCase()));
}

function hasAllowedType(place) {
  const types = Array.isArray(place?.types) ? place.types : [];
  return types.some((t) => RESULT_ALLOWLIST.has(String(t || "").toLowerCase()));
}

function shouldKeepPlace(place) {
  if (!place || typeof place !== "object") return false;

  const placeId = String(place.place_id || "").trim();
  const name = String(place.name || "").trim();

  if (!placeId || !name) return false;
  if (String(place.business_status || "").toUpperCase() === "CLOSED_PERMANENTLY") return false;
  if (hasBlockedType(place)) return false;
  if (!hasAllowedType(place)) return false;

  return true;
}

export default async function handler(req, res) {
  // ?�스??�?캐시 꼬임 방�?
  res.setHeader("Cache-Control", "no-store");
  const filename = typeof __filename === "string" ? __filename : "unknown";
  console.log("[places-nearby] handler active", filename);

  try {
    if (req.method !== "GET") {
      return sendJson(res, 405, { ok: false, error: "Use GET" });
    }

    const urlObj = new URL(req.url, "http://localhost");

    const lat = toFiniteNumber(getParam(req, urlObj, "lat"));
    const lng = toFiniteNumber(getParam(req, urlObj, "lng"));
    const radiusRaw = toFiniteNumber(getParam(req, urlObj, "radius"));
    const keyword = getParam(req, urlObj, "keyword");
    const placeType = normalizeType(getParam(req, urlObj, "type") || "restaurant");

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return sendJson(res, 400, { ok: false, error: "Missing lat/lng." });
    }

    const radius = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : 1500;
    const key = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();

    if (!key) {
      return sendJson(res, 500, {
        ok: false,
        error: "Missing GOOGLE_PLACES_API_KEY.",
      });
    }

    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: String(radius),
      type: placeType,
      key,
    });

    if (keyword) {
      params.set("keyword", keyword);
    }

    const googleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;
    const response = await fetch(googleUrl);

    if (!response.ok) {
      return sendJson(res, 502, {
        ok: false,
        error: "Places API failed.",
        details: `HTTP ${response.status}`,
      });
    }

    const data = await response.json();
    const googleStatus = String(data?.status || "");

    if (googleStatus && googleStatus !== "OK" && googleStatus !== "ZERO_RESULTS") {
      return sendJson(res, 502, {
        ok: false,
        error: "Google Places error",
        details: data?.error_message || googleStatus,
      });
    }

    const seen = new Set();

    const results = (Array.isArray(data?.results) ? data.results : [])
      .filter((place) => shouldKeepPlace(place))
      .filter((place) => {
        const placeId = String(place?.place_id || "").trim();
        if (!placeId || seen.has(placeId)) return false;
        seen.add(placeId);
        return true;
      })
      .slice(0, 8)
      .map((place) => ({
        placeId: place.place_id || "",
        name: place.name || "",
        vicinity: place.vicinity || "",
        lat: place?.geometry?.location?.lat ?? null,
        lng: place?.geometry?.location?.lng ?? null,
        rating: place?.rating ?? null,
        ratingsTotal: place?.user_ratings_total ?? null,
        openNow: place?.opening_hours?.open_now ?? null,
        photoRef: place?.photos?.[0]?.photo_reference ?? null,
        types: Array.isArray(place?.types) ? place.types : [],
      }));

    return sendJson(res, 200, { ok: true, results, debugStatus, debugError, debugTotal });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: "Places nearby failed",
      details: String(err?.message || err),
      stack: String(err?.stack || ""),
    });
  }
}



