import { PH, PW, puzzleRng, shuffle } from './core.ts';
import type { Op, Rng } from './core.ts';
import type { Lang } from '../shared/i18n.ts';

// Maths puzzles: number pyramid and magic square. One sheet holds 6 small puzzles.
const MATH_PER_SHEET = 6;
export type MathKind = 'pyr' | 'magic';

const PYR = [
  { rows: 3, lo: 1, hi: 6,  hide: 3 },
  { rows: 4, lo: 1, hi: 9,  hide: 5 },
  { rows: 5, lo: 2, hi: 15, hide: 8 }
];
// pyramid[i][j]: i = row from the top (0 = apex), j = brick; its children are [i+1][j] and [i+1][j+1]
export function pyrSolvable(known: boolean[][]): boolean {
  const k = known.map(r => r.slice()), R = k.length;
  let ch = true;
  while(ch){
    ch = false;
    for(let i = 0; i < R - 1; i++) for(let j = 0; j <= i; j++){
      const a = k[i][j], b = k[i + 1][j], c = k[i + 1][j + 1], n = (a ? 1 : 0) + (b ? 1 : 0) + (c ? 1 : 0);
      if(n === 2){ k[i][j] = k[i + 1][j] = k[i + 1][j + 1] = true; ch = true; }
    }
  }
  return k.every(r => r.every(x => x));
}
export interface Pyramid { vals: number[][]; known: boolean[][] }
function genPyramid(rnd: Rng, band: number): Pyramid {
  const B = PYR[band], R = B.rows;
  const vals: number[][] = [new Array<number>(R).fill(0).map(() => B.lo + Math.floor(rnd() * (B.hi - B.lo + 1)))];
  for(let i = 1; i < R; i++){ const prev = vals[0]; vals.unshift(prev.slice(0, -1).map((v, j) => v + prev[j + 1])); }
  const cells: [number, number][] = []; vals.forEach((r, i) => r.forEach((_v, j) => cells.push([i, j])));
  let known: boolean[][] | null = null;
  for(let hide = B.hide; hide >= 1 && !known; hide--){
    for(let t = 0; t < 300; t++){
      const order = shuffle(cells.slice(), rnd), k = vals.map(r => r.map(() => true));
      order.slice(0, hide).forEach(c => { k[c[0]][c[1]] = false; });
      if(pyrSolvable(k)){ known = k; break; }
    }
  }
  return { vals: vals, known: known || vals.map(r => r.map(() => true)) };
}

const LOSHU = [[8, 1, 6], [3, 5, 7], [4, 9, 2]];
const MAG = [
  { a: [1, 1], d: [1, 1], hide: 4 },
  { a: [1, 6], d: [1, 2], hide: 5 },
  { a: [2, 12], d: [2, 5], hide: 6 }
];
export function magSolvable(known: boolean[]): boolean {
  const k = known.slice();
  const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  let ch = true;
  while(ch){
    ch = false;
    for(const L of lines){
      const unk = L.filter(i => !k[i]);
      if(unk.length === 1){ k[unk[0]] = true; ch = true; }
    }
  }
  return k.every(x => x);
}
export interface Magic { vals: number[]; S: number; known: boolean[] }
function genMagic(rnd: Rng, band: number): Magic {
  const B = MAG[band];
  const a = B.a[0] + Math.floor(rnd() * (B.a[1] - B.a[0] + 1)), d = B.d[0] + Math.floor(rnd() * (B.d[1] - B.d[0] + 1));
  let g = LOSHU.map(r => r.slice());
  const rot = () => g[0].map((_, c) => g.map(r => r[c]).reverse());
  for(let i = Math.floor(rnd() * 4); i > 0; i--) g = rot();
  if(rnd() < 0.5) g = g.map(r => r.slice().reverse());
  const vals = ([] as number[]).concat(...g).map(v => a + d * (v - 1));
  const S = 3 * (a + 4 * d), idx = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  let known: boolean[] | null = null;
  for(let hide = B.hide; hide >= 1 && !known; hide--){
    for(let t = 0; t < 300; t++){
      const k = vals.map(() => true);
      shuffle(idx.slice(), rnd).slice(0, hide).forEach(i => { k[i] = false; });
      if(magSolvable(k)){ known = k; break; }
    }
  }
  return { vals: vals, S: S, known: known || vals.map(() => true) };
}

export interface MathSheet { kind: MathKind; band: number; items: (Pyramid | Magic)[] }
export function genMath(seed: number, band: number, kind: MathKind): MathSheet {
  const items: (Pyramid | Magic)[] = [];
  for(let i = 0; i < MATH_PER_SHEET; i++){
    const rnd = puzzleRng(seed, band, kind + '#' + i);
    items.push(kind === 'pyr' ? genPyramid(rnd, band) : genMagic(rnd, band));
  }
  return { kind: kind, band: band, items: items };
}

export function drawMath(p: MathSheet, solution: boolean, lang: Lang): Op[] {
  const ops: Op[] = [], cols = 2, rows = 3, tw = PW / cols, th = (PH - 10) / rows;
  p.items.forEach((item, n) => {
    const cx = (n % cols) * tw, cy = 6 + ((n / cols) | 0) * th;
    ops.push({ k: 'text', x: cx + 8, y: cy + 16, s: (n + 1) + ')', size: 14, b: true, a: 'l' });
    if(p.kind === 'pyr'){
      const it = item as Pyramid;
      const R = it.vals.length, bw = Math.min(62, (tw - 24) / R), bh = Math.min(40, (th - 40) / R);
      const x0 = cx + tw / 2 - R * bw / 2, y0 = cy + 30 + (th - 40 - R * bh) / 2;
      for(let i = 0; i < R; i++) for(let j = 0; j <= i; j++){
        const x = x0 + (R - 1 - i) * bw / 2 + j * bw, y = y0 + i * bh, hid = !it.known[i][j];
        if(solution && hid) ops.push({ k: 'line', x1: x + 3 + (bh - 5) / 2, y1: y + bh / 2, x2: x + bw - 3 - (bh - 5) / 2, y2: y + bh / 2, w: bh - 5, g: 215 });
        ops.push({ k: 'poly', pts: [[x, y], [x + bw, y], [x + bw, y + bh], [x, y + bh]], w: 1.6, close: true });
        if(!hid || solution) ops.push({ k: 'text', x: x + bw / 2, y: y + bh / 2 + 6, s: it.vals[i][j], size: 17, b: true, a: 'c' });
      }
    } else {
      const it = item as Magic;
      const cs = Math.min(64, (tw - 30) / 3), gs = cs * 3, x0 = cx + tw / 2 - gs / 2, y0 = cy + 52 + (th - 60 - gs) / 2;
      ops.push({ k: 'text', x: cx + tw / 2, y: cy + 34, s: (lang === 'hu' ? 'Az összeg: ' : 'The sum: ') + it.S, size: 13, b: true, a: 'c' });
      for(let r = 0; r < 3; r++) for(let c = 0; c < 3; c++){
        const i = r * 3 + c, x = x0 + c * cs, y = y0 + r * cs, hid = !it.known[i];
        if(solution && hid) ops.push({ k: 'line', x1: x + cs / 2, y1: y + cs / 2, x2: x + cs / 2, y2: y + cs / 2, w: cs - 8, g: 215 });
        ops.push({ k: 'poly', pts: [[x, y], [x + cs, y], [x + cs, y + cs], [x, y + cs]], w: 1.6, close: true });
        if(!hid || solution) ops.push({ k: 'text', x: x + cs / 2, y: y + cs / 2 + 7, s: it.vals[i], size: 20, b: true, a: 'c' });
      }
    }
  });
  return ops;
}
