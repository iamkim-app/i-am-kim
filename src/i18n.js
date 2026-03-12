// src/i18n.js — I AM KIM i18n engine
const LANG_KEY = 'iamkim_lang';
const SUPPORTED = ['en', 'ja', 'zh'];
let _strings = {};
let _lang = 'en';

function detectLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && SUPPORTED.includes(saved)) return saved;
  const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  if (nav.startsWith('ja')) return 'ja';
  if (nav.startsWith('zh')) return 'zh';
  return 'en';
}

async function loadStrings(lang) {
  const url = `/locales/${lang}.json?v=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${lang}`);
  return res.json();
}

export async function initI18n() {
  _lang = detectLang();
  try {
    _strings = await loadStrings(_lang);
  } catch {
    _strings = {};
  }
}

export function t(key, vars = {}) {
  let str = (_strings[key] != null && _strings[key] !== '') ? _strings[key] : null;
  // Fallback: try to get from window._i18n_en if available
  if (str == null && window._i18n_en) str = window._i18n_en[key] || key;
  if (str == null) str = key;
  // Replace {var} placeholders
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));
}

export function getLang() { return _lang; }

export async function setLang(lang) {
  if (!SUPPORTED.includes(lang)) return;
  localStorage.setItem(LANG_KEY, lang);
  _lang = lang;
  try {
    _strings = await loadStrings(lang);
  } catch {
    _strings = {};
  }
  // Re-render the app
  if (typeof window.App?.rerenderAll === 'function') {
    window.App.rerenderAll();
  } else {
    window.location.reload();
  }
}
