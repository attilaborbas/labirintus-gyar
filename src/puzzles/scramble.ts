import { PH, puzzleRng, shuffle } from './core.ts';
import type { Op, Rng } from './core.ts';
import { themeWords } from './words.ts';
import type { Lang } from '../shared/i18n.ts';

// Word scramble: work out the word hidden in the mixed-up letters and write it in the boxes.
const SCR = [
  { n: 6, minLen: 3, maxLen: 5,  hint: true },
  { n: 8, minLen: 4, maxLen: 7,  hint: false },
  { n: 9, minLen: 5, maxLen: 10, hint: false }
];
function scrambleWord(w: string, rnd: Rng): string {
  const a = w.split('');
  for(let t = 0; t < 50; t++){
    shuffle(a, rnd);
    if(a.join('') !== w) break;
  }
  return a.join('');
}
export interface Scramble { rows: { w: string; s: string }[]; hint: boolean; band: number; lang: Lang; theme: string }
export function genScramble(seed: number, band: number, st: { theme: string }, lang: Lang): Scramble {
  const B = SCR[band], rnd = puzzleRng(seed, band, 'scr' + st.theme + lang);
  let pool = themeWords(st.theme, lang).filter(w => w.length >= B.minLen && w.length <= B.maxLen);
  if(pool.length < B.n) pool = pool.concat(themeWords('mix', lang).filter(w => w.length >= B.minLen && w.length <= B.maxLen && pool.indexOf(w) < 0));
  shuffle(pool, rnd);
  const words = pool.slice(0, B.n).sort((a, b) => a.length - b.length);
  const rows = words.map(w => ({ w: w, s: scrambleWord(w, rnd) }));
  return { rows: rows, hint: B.hint, band: band, lang: lang, theme: st.theme };
}
export function drawScramble(p: Scramble, solution: boolean): Op[] {
  const ops: Op[] = [], n = p.rows.length, rh = Math.min(80, (PH - 10) / n), cell = 32, x0 = 44;
  p.rows.forEach((r, i) => {
    const y = 8 + i * rh, len = r.w.length;
    ops.push({ k: 'text', x: 4, y: y + 30, s: (i + 1) + ')', size: 14, b: true, a: 'l' });
    for(let j = 0; j < len; j++){
      const cx = x0 + j * (cell + 4) + cell / 2;
      ops.push({ k: 'text', x: cx, y: y + 24, s: r.s[j], size: 24, b: true, a: 'c' });
      const bx = x0 + j * (cell + 4), by = y + 34;
      if(solution) ops.push({ k: 'line', x1: bx + 14, y1: by + cell / 2, x2: bx + cell - 14, y2: by + cell / 2, w: cell - 4, g: 220 });
      ops.push({ k: 'poly', pts: [[bx, by], [bx + cell, by], [bx + cell, by + cell], [bx, by + cell]], w: 1.5, close: true });
      if(solution || (p.hint && j === 0)) ops.push({ k: 'text', x: cx, y: by + cell / 2 + 8, s: r.w[j], size: 22, b: true, a: 'c', g: solution || j > 0 ? 0 : 110 });
    }
  });
  return ops;
}
