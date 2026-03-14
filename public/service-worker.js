/**
 * I AM KIM — Service Worker v5
 *
 * 캐시 전략:
 *   navigate         → network-first, fallback to shell
 *   /assets/* (hash) → cache-first (Vite content-hash, 영구)
 *   이미지           → cache-first  (CACHE_IMG)
 *   /api/*, /data/*  → stale-while-revalidate (CACHE_API)
 *   Supabase REST    → stale-while-revalidate (CACHE_API, URL-key 정규화)
 *   기타 same-origin → cache-first  (CACHE_SHELL)
 *
 * 앱 껐다 켜도 마지막 API 응답 즉시 표시 후 백그라운드 갱신.
 */

const CACHE_SHELL = 'iamkim-shell-v5';
const CACHE_API   = 'iamkim-api-v5';
const CACHE_IMG   = 'iamkim-img-v5';

const KNOWN_CACHES = new Set([CACHE_SHELL, CACHE_API, CACHE_IMG]);

const SHELL_PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/data/korea_now.json',
];

/* ── Install: app shell 프리캐시 ─────────────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL)
      .then((c) => c.addAll(SHELL_PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

/* ── Activate: 구 버전 캐시 삭제 ─────────────────────────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !KNOWN_CACHES.has(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ── 헬퍼 ────────────────────────────────────────────────── */

function isHashedAsset(url) {
  return (
    url.origin === self.location.origin &&
    url.pathname.startsWith('/assets/')
  );
}

function isImageRequest(req, url) {
  // Google Places 사진 프록시 포함
  if (url.pathname.startsWith('/api/places-photo')) return true;
  if (req.destination === 'image') return true;
  return /\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(url.pathname);
}

function isSupabaseRest(url) {
  // REST API만 캐시 (auth / realtime / storage upload 제외)
  return (
    url.hostname.endsWith('.supabase.co') &&
    url.pathname.startsWith('/rest/v1/')
  );
}

function isSameOriginApiOrData(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/'))
  );
}

/**
 * Cache-first: 캐시 있으면 즉시 반환, 없으면 fetch 후 저장
 */
async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch {
    return new Response('', { status: 504, statusText: 'Network unavailable' });
  }
}

/**
 * Stale-while-revalidate:
 *   캐시 있으면 즉시 반환 + 백그라운드 갱신
 *   캐시 없으면 fetch 대기 후 저장 (첫 로드)
 *
 * @param {string}          cacheName
 * @param {Request}         request     실제 fetch에 사용 (헤더 포함)
 * @param {string|Request}  [cacheKey]  캐시 저장/조회 키 (URL 정규화 시 사용)
 */
async function swr(cacheName, request, cacheKey) {
  const key   = cacheKey ?? request;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(key);

  // 백그라운드 fetch — 항상 실행하여 캐시 최신화
  const revalidate = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(key, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);

  // 캐시 있으면 즉시 반환 (stale), 없으면 네트워크 기다림
  return cached ?? revalidate;
}

/* ── Fetch 인터셉터 ──────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GET만 처리
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  /* 1. 페이지 내비게이션: network-first, 오프라인 fallback */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE_SHELL);
        cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
        const cache  = await caches.open(CACHE_SHELL);
        const cached = await cache.match('/');
        return cached ?? new Response(
          '<!doctype html><title>Offline</title><p>Connect to the internet to use I AM KIM.</p>',
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }
    })());
    return;
  }

  /* 2. Vite 해시 빌드 에셋: cache-first (영구 캐시) */
  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(CACHE_SHELL, req));
    return;
  }

  /* 3. 이미지 (Google Places 프록시 포함): cache-first */
  if (isImageRequest(req, url)) {
    event.respondWith(cacheFirst(CACHE_IMG, req));
    return;
  }

  /* 4. Supabase REST API: stale-while-revalidate
        Authorization 헤더는 fetch에는 포함, 캐시 키는 URL만 사용
        (동일 기기 단일 사용자 앱 — 공용 컨텐츠 캐싱 안전) */
  if (isSupabaseRest(url)) {
    event.respondWith(swr(CACHE_API, req, url.href));
    return;
  }

  /* 5. /api/*, /data/*: stale-while-revalidate */
  if (isSameOriginApiOrData(url)) {
    event.respondWith(swr(CACHE_API, req));
    return;
  }

  /* 6. 그 외 동일 출처: cache-first */
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(CACHE_SHELL, req));
  }
});

/* ── 메시지 핸들러 ────────────────────────────────────────── */
self.addEventListener('message', (event) => {
  // 로그아웃 시 메인 앱에서 호출: API 캐시만 비움
  if (event.data?.type === 'CLEAR_API_CACHE') {
    caches.delete(CACHE_API).catch(() => {});
  }
  // 전체 캐시 초기화 (개발/디버그용)
  if (event.data?.type === 'CLEAR_ALL_CACHE') {
    Promise.all([CACHE_SHELL, CACHE_API, CACHE_IMG].map((n) => caches.delete(n))).catch(() => {});
  }
});
