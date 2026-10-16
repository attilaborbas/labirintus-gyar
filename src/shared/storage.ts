import { isLang } from './i18n.ts';
import type { Lang } from './i18n.ts';

// Every page keeps its own settings; only the language is shared. All access is guarded: storage can be unavailable.
export const LANG_KEY = 'maze-factory-lang';

export function loadJson(key: string): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch(e){ return {}; }
}
export function saveJson(key: string, value: unknown, lang: Lang | null): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if(lang) localStorage.setItem(LANG_KEY, lang);
  } catch(e){ /* ignore */ }
}
export function readLangPref(): Lang | null {
  try { const v = localStorage.getItem(LANG_KEY); return isLang(v) ? v : null; } catch(e){ return null; }
}
