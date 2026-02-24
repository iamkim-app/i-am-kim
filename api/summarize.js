import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { YoutubeTranscript } from "youtube-transcript";
/**
 * POST /api/summarize
 * Body: { url?: string, transcript?: string }
 * Header: Authorization: Bearer <supabase_access_token>
 *
 * Server env (Vercel Project Settings Environment Variables):
 * - GEMINI_API_KEY   (secret)
 * - (optional) GEMINI_MODEL, FREE_LIMIT
 * - SUPABASE_URL + SUPABASE_ANON_KEY  (or set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
 *
 * Why this is safe:
 * - GEMINI_API_KEY is ONLY on the server.
 * - Supabase ANON key is OK to be public.
 */

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function bearerToken(req) {
  const h = req.headers?.authorization || "";
  if (!h) return "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function safeInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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

  // ✅ 유저 JWT를 헤더로 붙인 supabase client
  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: header,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function geminiModelCandidates() {
  const env = (process.env.GEMINI_MODEL || "").trim();
  const list = [env, "gemini-2.0-flash", "gemini-2.0-flash-lite"].filter(Boolean);
  return [...new Set(list)];
}

function jsonSchema() {
  return {
    type: "object",
    properties: {
      summary: { type: "string" },
      must_know: { type: "array", items: { type: "string" } },
      key_moments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            time: { type: "string" },
            title: { type: "string" },
            why: { type: "string" },
          },
          required: ["time", "title", "why"],
        },
      },
      places_foods: { type: "array", items: { type: "string" } },
    },
    required: ["summary", "must_know", "key_moments", "places_foods"],
  };
}

function buildPrompt({ safeUrl }) {
  return [
    "You summarize YouTube transcripts into practical Korea-travel-focused viewer insights.",
    "Detect transcript language automatically and translate internally if needed.",
    "Output must be English JSON only.",
    "Return JSON with these keys (mode is optional):",
    "{",
    "  summary: string,",
    "  must_know: string[],",
    "  key_moments: [{ time: string, title: string, why: string }],",
    "  places_foods: string[],",
    "  mode?: \"travel\"|\"kpop\"|\"other\"",
    "}",
    "",
    "Strict rules:",
    "- No markdown, no code fences, no extra text outside JSON.",
    "- Never invent details that are not in the transcript.",
    "- If something is not mentioned in the transcript, do not include it.",
    "- summary must be clear, evidence-based, and non-empty English text.",
    "- must_know target is 26 English items.",
    "- If transcript is short or sparse, return fewer must_know items rather than guessing.",
    "- If adding general advice, label each such item with \"General tip:\" and keep it generic.",
    "- key_moments: always return 3-6 items unless the transcript is empty.",
    "- If timestamps are not explicitly present, estimate them logically from sequence and length.",
    "- Format key_moments.time as MM:SS.",
    "- places_foods: return an empty array when none are explicitly mentioned; include only items directly supported by transcript text.",
    "- Focus on practical utility: steps, warnings, tools/items needed, costs, transit flow, local etiquette, and pitfalls.",
    "- Ignore filler (greetings, jokes, sponsorships, self-promotion).",
    "- If no strong Korea travel context is present, still return useful viewer/traveler insights from the content.",
    "- Keep outputs specific, concise, and non-redundant.",
    "",
    safeUrl ? `Video URL: ${safeUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "");
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const m = u.pathname.match(/\/shorts\/([^/]+)/);
    if (m) return m[1];
  } catch {}
  return "";
}

function normalizeYoutubeUrl(url) {
  const id = extractVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : url;
}

async function fetchYoutubeOEmbed(videoId) {
  if (!videoId) return null;
  const oembedUrl =
    "https://www.youtube.com/oembed?url=" +
    encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`) +
    "&format=json";
  try {
    const res = await fetch(oembedUrl);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: String(data?.title || "").trim(),
      authorName: String(data?.author_name || "").trim(),
    };
  } catch {
    return null;
  }
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const rr = String(r).padStart(2, "0");
  if (h > 0) return `${String(h).padStart(2, "0")}:${mm}:${rr}`;
  return `${mm}:${rr}`;
}

function transcriptItemsToText(items) {
  // youtube-transcript often returns { text, offset, duration }
  // offset can be seconds or ms depending on version; we handle both.
  const lines = [];
  for (const it of items || []) {
    const text = String(it?.text || "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    const raw = Number(it?.offset);
    let sec = 0;
    if (Number.isFinite(raw)) {
      sec = raw > 10000 ? raw / 1000 : raw; // heuristic: treat big numbers as ms
    }
    lines.push(`[${formatTime(sec)}] ${text}`);
  }
  return lines.join("\n").trim();
}

function decodeXmlEntities(str) {
  return String(str || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function parseXmlAttributes(raw) {
  const attrs = {};
  String(raw || "")
    .trim()
    .replace(/([a-zA-Z_:-]+)="([^"]*)"/g, (_, key, val) => {
      attrs[key] = val;
      return "";
    });
  return attrs;
}

function parseTimedTextTracks(xml) {
  const tracks = [];
  const re = /<track\b([^>]*)\/?>/g;
  let m;
  while ((m = re.exec(String(xml || "")))) {
    const attrs = parseXmlAttributes(m[1]);
    const lang = String(attrs.lang_code || "").trim();
    if (!lang) continue;
    tracks.push({
      lang,
      name: String(attrs.name || "").trim(),
      kind: String(attrs.kind || "").trim(),
    });
  }
  return tracks;
}

function parseTimedTextXml(xml) {
  const lines = [];
  const re = /<text\b[^>]*>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(String(xml || "")))) {
    const text = decodeXmlEntities(m[1]).replace(/\s+/g, " ").trim();
    if (text) lines.push(text);
  }
  return lines.join("\n").trim();
}

function parseTimestampToSeconds(ts) {
  const t = String(ts || "").trim();
  if (!t) return 0;
  const parts = t.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
  if (parts.length === 3)
    return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return 0;
}

function extractChaptersFromDescription(text) {
  const lines = String(text || "").split(/\r?\n/);
  const chapters = [];
  for (const line of lines) {
    const m = line.match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/);
    if (!m) continue;
    const sec = parseTimestampToSeconds(m[1]);
    const title = String(m[2] || "").trim();
    if (!sec || !title) continue;
    chapters.push({
      time: formatTime(sec),
      title,
      why: "Chapter",
    });
  }
  return chapters.slice(0, 12);
}

async function fetchWatchHtml(videoId) {
  if (!videoId) return "";
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  try {
    const watchRes = await fetch(watchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!watchRes.ok) return "";
    return await watchRes.text();
  } catch {
    return "";
  }
}

function extractDescriptionFromPlayerResponse(jsonText) {
  if (!jsonText) return "";
  try {
    const parsed = JSON.parse(jsonText);
    const runs = parsed?.videoDetails?.shortDescription;
    return String(runs || "");
  } catch {
    return "";
  }
}

async function fetchTimedTextTranscript(videoId) {
  if (!videoId) return { text: "", source: "none", error: "Missing video id." };
  try {
    const html = await fetchWatchHtml(videoId);
    if (!html) {
      return { text: "", source: "none", error: "no_player_response" };
    }

    const json = extractPlayerResponseFromHtml(html);
    if (!json) {
      return { text: "", source: "none", error: "no_player_response" };
    }

    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { text: "", source: "none", error: "parse_failed" };
    }

    const tracks =
      parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (!Array.isArray(tracks) || !tracks.length) {
      return { text: "", source: "none", error: "no_captions_block" };
    }

    const track = pickBestCaptionTrack(tracks);
    if (!track?.baseUrl) {
      return { text: "", source: "none", error: "no_captions_block" };
    }

    const baseUrl = stripTlang(track.baseUrl);
    const variants = [
      { url: baseUrl, err: "timedtext empty" },
      { url: `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}fmt=vtt`, err: "fmt=vtt empty" },
      { url: `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}fmt=srv3`, err: "fmt=srv3 empty" },
    ];

    let lastEmptyErr = "Timedtext empty.";
    for (const variant of variants) {
      const capRes = await fetch(variant.url);
      if (!capRes.ok) {
        return { text: "", source: "none", error: `timedtext HTTP ${capRes.status}` };
      }
      const capXml = await capRes.text();
      const text = parseTimedTextXml(capXml);
      if (text) {
        return {
          text,
          source: track?.kind === "asr" ? "timedtext-auto" : "timedtext-manual",
          error: "",
        };
      }
      lastEmptyErr = variant.err;
    }

    return { text: "", source: "none", error: lastEmptyErr };

  } catch (err) {
    return { text: "", source: "none", error: String(err?.message || err) };
  }
}

function extractPlayerResponseFromHtml(html) {
  const text = String(html || "");
  const assignMatch = text.match(/ytInitialPlayerResponse\s*=\s*({[\s\S]*?});/);
  if (assignMatch && assignMatch[1]) return assignMatch[1];

  const scriptMatch = text.match(/"ytInitialPlayerResponse"\s*:\s*({[\s\S]*?})\s*,\s*"videoDetails"/);
  if (scriptMatch && scriptMatch[1]) return scriptMatch[1];

  return "";
}

function pickBestCaptionTrack(tracks) {
  const list = Array.isArray(tracks) ? tracks : [];
  if (!list.length) return null;
  const isEnglish = (t) => String(t?.languageCode || "").toLowerCase().startsWith("en");
  const nonAsr = list.filter((t) => t?.kind !== "asr");
  const asr = list.filter((t) => t?.kind === "asr");
  const englishNonAsr = nonAsr.filter(isEnglish);
  const englishAsr = asr.filter(isEnglish);
  return englishNonAsr[0] || nonAsr[0] || englishAsr[0] || list[0] || null;
}

function stripTlang(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete("tlang");
    return u.toString();
  } catch {
    return url;
  }
}

async function fetchTranscriptWithFallback(url) {
  const defaultLangs = ["ko", "en", "en-US", "en-GB", "auto"];
  let lastErr = "";
  let availableLangs = null;

  function parseAvailableLangs(errMsg) {
    const msg = String(errMsg || "");
    const idx = msg.indexOf("Available languages:");
    if (idx === -1) return [];
    const raw = msg.slice(idx + "Available languages:".length).trim();
    if (!raw) return [];
    return raw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const attemptWithLangs = async (langs, source) => {
    for (const lang of langs) {
      try {
        const items = await YoutubeTranscript.fetchTranscript(url, { lang });
        const out = transcriptItemsToText(items);
        if (out) return { text: out, source, error: "" };
      } catch (err) {
        lastErr = String(err?.message || err || `${source} captions failed`);
        const parsed = parseAvailableLangs(lastErr);
        if (parsed.length) availableLangs = parsed;
      }
    }
    return null;
  };

  // First pass: normal preference order (ensure "en" before "auto")
  let result = await attemptWithLangs(defaultLangs, "manual");
  if (result) return result;

  // If available languages were returned, retry using that list (priority)
  if (availableLangs && availableLangs.length) {
    result = await attemptWithLangs(availableLangs, "manual");
    if (result) return result;
  }

  // Hard fallback: fetch timedtext captions (manual + auto)
  const videoId = extractVideoId(url);
  const timed = await fetchTimedTextTranscript(videoId);
  if (timed?.text) return timed;
  if (timed?.error) lastErr = timed.error;

  // Extra fallback: try without a lang hint (library auto-detect)
  try {
    const items = await YoutubeTranscript.fetchTranscript(url);
    const out = transcriptItemsToText(items);
    if (out) return { text: out, source: "auto", error: "" };
  } catch (err) {
    lastErr = String(err?.message || err || "auto captions failed");
  }

  return { text: "", source: "none", error: lastErr || "Transcript unavailable." };
}

async function getQuotaOrThrow({ sb }) {
  const freeLimit = 3;
  if (!sb) {
    const err = new Error("Quota system error");
    err.status = 500;
    err.details = "Supabase user client unavailable.";
    throw err;
  }

  const { data, error } = await sb.rpc("get_quota_status", { free_limit: 3 });
  if (error) {
    const err = new Error("Quota system error");
    err.status = 500;
    err.details = error?.message || String(error);
    throw err;
  }

  const row = Array.isArray(data) ? data[0] : data;
  const remaining = Number(row?.remaining);
  const limit = Number(row?.limit);
  if (!Number.isFinite(remaining)) {
    const err = new Error("Quota system error");
    err.status = 500;
    err.details = "get_quota_status did not return numeric remaining.";
    throw err;
  }
  if (remaining <= 0) {
    const lim = Number.isFinite(limit) ? limit : freeLimit;
    const err = new Error(`Free limit reached (${lim} videos).`);
    err.status = 402;
    throw err;
  }

  return { freeLimit };
}

function normalizeInsights(obj) {
  const out = {
    summary: String(obj?.summary || "").trim(),
    must_know: Array.isArray(obj?.must_know) ? obj.must_know.map(String) : [],
    key_moments: Array.isArray(obj?.key_moments)
      ? obj.key_moments.map((m) => ({
          time: String(m?.time || "").trim(),
          title: String(m?.title || "").trim(),
          why: String(m?.why || "").trim(),
        }))
      : [],
    places_foods: Array.isArray(obj?.places_foods) ? obj.places_foods.map(String) : [],
  };
  return out;
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const geminiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!geminiKey) {
    return res.status(500).json({ error: "Server is missing GEMINI_API_KEY." });
  }

  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Please sign in first." });
  }
  const sbEnv = getSupabaseEnv();
  if (!sbEnv.url || !sbEnv.anonKey) {
    return res.status(500).json({ error: "Supabase env missing." });
  }
  const sb = getSupabaseAsUser(token);
  if (!sb) {
    return res.status(500).json({ error: "Supabase client error." });
  }
  const { data: authData, error: authError } = await sb.auth.getUser();
  if (authError || !authData?.user?.id) {
    return res.status(401).json({ error: "Please sign in first." });
  }

  const body = req.body || {};
  const url = (body.url || "").trim();
  const pastedTranscript = (body.transcript || "").trim();

  if (!url && !pastedTranscript) {
    return res.status(400).json({ error: "Provide a YouTube URL (or paste transcript text)." });
  }

  // 0) Quota check (cost control)
  let quota;
  try {
    quota = await getQuotaOrThrow({ sb });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({
      error: err?.message || "Quota check failed.",
      ...(status === 500 && err?.details ? { details: String(err.details) } : {}),
    });
  }

  // 1) Get transcript text (with timestamps when possible)
  const safeUrl = url ? normalizeYoutubeUrl(url) : "";
  let transcriptText = pastedTranscript;
  let fallbackMode = false;
  let metadataText = "";
  let transcriptSource = "";
  let transcriptError = "";
  let chapterMoments = [];

  if (transcriptText) {
    transcriptSource = "manual";
  } else if (safeUrl) {
    try {
      const fetched = await fetchTranscriptWithFallback(safeUrl);
      transcriptText = fetched?.text || "";
      transcriptSource = fetched?.source || "none";
      transcriptError = fetched?.error ? String(fetched.error) : "";
    } catch (err) {
      transcriptText = "";
      transcriptSource = "none";
      transcriptError = String(err?.message || err || "Transcript unavailable.");
    }
  }

  if (!transcriptText) {
    fallbackMode = true;
    const videoId = extractVideoId(safeUrl || url);
    const meta = await fetchYoutubeOEmbed(videoId);
    const titleLine = meta?.title ? `Title: ${meta.title}` : "";
    const authorLine = meta?.authorName ? `Author: ${meta.authorName}` : "";
    const urlLine = safeUrl ? `Video URL: ${safeUrl}` : "";
    metadataText = [titleLine, authorLine, urlLine].filter(Boolean).join("\n").trim();

    if (transcriptError.toLowerCase().includes("empty")) {
      const html = await fetchWatchHtml(videoId);
      const json = extractPlayerResponseFromHtml(html);
      const desc = extractDescriptionFromPlayerResponse(json);
      const chapters = extractChaptersFromDescription(desc);
      if (chapters.length) {
        chapterMoments = chapters.slice(0, 12);
      }
    }
  }

  // Safety / cost guard: limit input size
  const MAX_CHARS = 25000;
  let wasTruncated = false;
  if (transcriptText && transcriptText.length > MAX_CHARS) {
    transcriptText = transcriptText.slice(0, MAX_CHARS) + "\n\n[TRUNCATED]";
    wasTruncated = true;
  }

  // 2) Ask Gemini to summarize (structured JSON)
  if (!fallbackMode && transcriptText.length < 200) {
    return res.status(400).json({ error: "Transcript is too short to summarize." });
  }
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const candidates = geminiModelCandidates();
  const prompt =
    buildPrompt({ safeUrl }) +
    (fallbackMode
      ? "\n\nMetadata-only mode:\n- No transcript is available.\n- key_moments must be an empty array.\n- Do not invent timestamps or detailed claims beyond the metadata."
      : "");
  const contentText = fallbackMode
    ? `Metadata:\n${metadataText || "No metadata available."}`
    : `Transcript:\n${transcriptText}`;

  let lastErr = null;
  let insights = null;

  for (const model of candidates) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ text: prompt + "\n\n" + contentText }],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema(),
        },
      });

      const raw = String(response.text || "").trim();
      if (!raw) throw new Error("Empty model response");
      // JSON.parse safety: output is required to be strict JSON by schema; parsing is guarded.
      const parsed = JSON.parse(raw);
      const normalized = normalizeInsights(parsed);
      if (fallbackMode) {
        normalized.key_moments = chapterMoments.length ? chapterMoments : [];
      }
      if (normalized.summary) {
        insights = normalized;
        break;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (!insights) {
    const msg = lastErr?.message ? String(lastErr.message) : "Unknown error";
    const lower = msg.toLowerCase();
    let friendly = msg;

    if (lower.includes("quota") || lower.includes("exhausted") || lower.includes("billing")) {
      friendly = "Gemini quota/billing issue. Check your Google AI plan and billing.";
    }

    return res.status(500).json({ error: "Summarization failed.", details: friendly });
  }

  // 3) Consume quota AFTER success (good UX)
  let remaining = 0;
  try {
    const { data: quotaAfter, error: consumeError } = await sb.rpc("consume_quota", {
      free_limit: 3,
    });
    if (consumeError) {
      const err = new Error("Quota system error");
      err.status = 500;
      err.details = consumeError?.message || String(consumeError);
      throw err;
    }
    const row = Array.isArray(quotaAfter) ? quotaAfter[0] : quotaAfter;
    const parsed = Number(row?.remaining);
    remaining = Number.isFinite(parsed) ? parsed : 0;
  } catch (err) {
    return res.status(500).json({
      error: "Quota system error",
      ...(err?.details ? { details: String(err.details) } : {}),
    });
  }

  const summaryText = String(insights?.summary || "").trim();

  return res.status(200).json({
    summary: summaryText,
    insights,
    transcript: transcriptText,
    transcriptTruncated: wasTruncated,
    remaining,
    transcriptSource,
    transcriptError,
  });
}
