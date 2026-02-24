# I AM KIM — Gemini + Supabase (App Store MVP)

**What this app does**
- Paste a YouTube link → the video loads
- Press **Play & Extract** → Gemini summarizes **travel-only** info + **timestamps you can tap**
- Community board: posts + **1 photo per post** (Supabase)

---

## 0) Open the correct folder (important ✅)

After unzipping, make sure you are inside the folder that contains:

- `package.json`
- `src/`
- `api/`

If you run `npm run dev` in the wrong folder, you will get:
> Missing script: "dev"

---

## 1) Install requirements

- Node.js **20.x**
- Vercel CLI (optional for full backend locally):
  - `npm i -g vercel`

---

## 2) Run UI only (no backend)

This runs the **UI only** (the page loads, but AI extraction won’t work yet).

```bash
npm install
npm run dev
```

Open the Local URL shown in the terminal.

---

## 3) Run FULL app locally (UI + /api) ✅

To test Gemini summarization locally, you must use Vercel dev (so `/api/summarize` works):

```bash
vercel login
vercel dev
```

The first time, Vercel will ask to set up / link the project.

---

## 4) Supabase setup (Auth + DB + Storage)

### A) Create a Supabase project
Supabase Dashboard → New project

### B) Run SQL
Supabase → **SQL Editor** → paste and run:

- `supabase_setup.sql`

This creates:
- `usage_quota` + functions for **3 free analyses per user**
- `posts` + `reports`
- storage bucket `community-images`

### C) Enable OAuth (Google / Apple)
Supabase → Authentication → Providers  
Enable Google + Apple (you’ll add keys from Google/Apple later).

Add these **Redirect URLs**:
- Local dev: `http://localhost:3000`
- Vercel: your production domain, e.g. `https://YOUR_APP.vercel.app`

---

## 5) Environment variables (NO keys in src/ 🚫)

Create a file named `.env.local` in the project root (same level as `package.json`).

Copy from `.env.example` and fill in:

```bash
VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"

# server-side (Vercel Functions)
SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# optional
GEMINI_MODEL="gemini-2.0-flash"
FREE_LIMIT="3"
```

✅ Safe rule:
- **Gemini API key** must exist ONLY in `.env.local` and Vercel Environment Variables.
- Supabase **anon** key is public by design (OK in frontend).
- `.env.local` is ignored by `.gitignore`.

---

## 6) Deploy to Vercel

```bash
vercel --prod
```

Then in Vercel Dashboard → Project → Settings → Environment Variables, add the same variables as above.

---

## App Store note (later)

This is a PWA-first build.  
When you wrap into iOS/Android (Capacitor), go to **About** → set your deployed backend URL (Vercel domain).

---

## Files you will edit most

- `public/data/korea_now.json` → content for the **Korea Now** categories
- `src/main.js` → UI logic
- `src/style.css` → design
- `api/summarize.js` → Gemini summarization backend (server-only)
