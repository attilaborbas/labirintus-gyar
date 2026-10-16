// Tiny i18n helper shared by the pages. Hungarian and English only.
export type Lang = 'hu' | 'en';
export type Dict = Record<string, string | string[]>;
export const LANGS: [Lang, string][] = [['hu', 'Magyar'], ['en', 'English']];

export function isLang(v: unknown): v is Lang { return v === 'hu' || v === 'en'; }

// Picks the language: the saved preference, otherwise the first supported browser language, otherwise English.
export function detectLang(pref: string | null | undefined): Lang {
  if(isLang(pref)) return pref;
  let list: readonly string[] = [];
  try { list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language]; } catch(e){ /* ignore */ }
  for(const l of list){
    const p = String(l || '').toLowerCase().split('-')[0];
    if(isLang(p)) return p;
  }
  return 'en';
}

export interface I18n {
  get lang(): Lang;
  set(lang: Lang): void;
  t(key: string, ...args: (string | number)[]): string;
  list(key: string): string[];
}
export function createI18n(texts: Record<Lang, Dict>): I18n {
  let lang: Lang = 'en';
  const lookup = (key: string) => { const v = texts[lang][key]; return v === undefined ? texts.en[key] : v; };
  return {
    get lang(){ return lang; },
    set(l){ lang = l; },
    t(key, ...args){
      const v = lookup(key);
      if(typeof v !== 'string') return '';
      return args.length ? v.replace(/\{(\d)\}/g, (_m, i) => String(args[+i])) : v;
    },
    list(key){ const v = lookup(key); return Array.isArray(v) ? v : []; }
  };
}
