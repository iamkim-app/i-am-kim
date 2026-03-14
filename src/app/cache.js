/**
 * cache.js
 * 두-레이어 캐시: 메모리(Map) + localStorage
 * TTL 만료 전이면 cached 데이터를 즉시 반환, 만료 후엔 null 반환
 */

export const TTL = {
  HOME:      5  * 60 * 1000,  // 5분  — 홈 피드
  NEWS:      5  * 60 * 1000,  // 5분  — News / Korea Now
  COMMUNITY: 10 * 60 * 1000,  // 10분 — 커뮤니티
  K:         10 * 60 * 1000,  // 10분 — Special K (비교적 정적)
};

const PREFIX = "iamkim_c_";   // localStorage key prefix
const _mem   = new Map();     // 메모리 캐시

/**
 * 캐시에서 데이터를 읽음.
 * 메모리 → localStorage 순으로 확인.
 * TTL 만료 시 자동 삭제 후 null 반환.
 */
export function getCache(key) {
  // 1) 메모리 확인
  const mem = _mem.get(key);
  if (mem) {
    if (Date.now() < mem.exp) return mem.data;
    _mem.delete(key);
  }

  // 2) localStorage fallback
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() < entry.exp) {
      _mem.set(key, entry);   // 메모리 워밍
      return entry.data;
    }
    localStorage.removeItem(PREFIX + key);
  } catch {}

  return null;
}

/**
 * 캐시에 데이터 저장.
 * @param {string} key
 * @param {*}      data   — JSON 직렬화 가능한 값
 * @param {number} ttl    — TTL ms (TTL.HOME 등)
 */
export function setCache(key, data, ttl) {
  const entry = { data, exp: Date.now() + ttl };
  _mem.set(key, entry);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage 용량 초과 시 메모리만 사용
  }
}

/**
 * 캐시 삭제.
 * @param {string} [key] — 생략하면 전체 삭제
 */
export function clearCache(key) {
  if (key) {
    _mem.delete(key);
    try { localStorage.removeItem(PREFIX + key); } catch {}
  } else {
    _mem.clear();
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    } catch {}
  }
}

/* ── Skeleton HTML helpers ── */

/**
 * 카드형 스켈레톤 HTML 반환
 * @param {number} count   카드 수
 * @param {{ img?: boolean, lines?: number }} opts
 */
export function skeletonCards(count = 3, { img = true, lines = 2 } = {}) {
  return Array.from({ length: count }, () => `
    <div class="skeletonCard">
      ${img ? '<div class="skeletonCard__img skeleton"></div>' : ""}
      <div class="skeletonCard__title skeleton"></div>
      ${lines >= 2 ? '<div class="skeletonCard__sub skeleton"></div>' : ""}
    </div>
  `).join("");
}

/**
 * 리스트형 스켈레톤 HTML 반환
 * @param {number} rows 행 수
 */
export function skeletonRows(rows = 4) {
  const widths = ["wide", "mid", "short", "wide", "mid"];
  return `<div class="skeletonList">${
    Array.from({ length: rows }, (_, i) =>
      `<div class="skeletonRow skeletonRow--${widths[i % widths.length]} skeleton"></div>`
    ).join("")
  }</div>`;
}
