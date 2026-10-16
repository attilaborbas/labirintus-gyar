import { BANDS, PW, puzzleRng } from './core.ts';
import type { Op } from './core.ts';
import type { Lang } from '../shared/i18n.ts';

// Dot-to-dot: closed outlines; corners are always dots, the remaining dots are spread evenly.
// Points are [x, y, isCorner]; y grows downwards.
type Pt = [number, number, boolean];
type Pos = [number, number];

function C(x: number, y: number): Pt { return [x, y, true]; }
function Sm(x: number, y: number): Pt { return [x, y, false]; }
function curve(f: (t: number) => Pos, t0: number, t1: number, n: number): Pt[] {
  const a: Pt[] = [];
  for(let i = 1; i < n; i++){ const t = t0 + (t1 - t0) * i / n; const q = f(t); a.push(Sm(q[0], q[1])); }
  return a;
}
function quad(p0: Pos, p1: Pos, p2: Pos, n: number): Pt[] {
  return curve(t => [(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]], 0, 1, n);
}

export interface DotShape { id: string; name: Record<Lang, string>; pts: () => Pt[] }
export const DOT_SHAPES: DotShape[] = [
  { id: 'heart', name: { hu: 'Szív', en: 'Heart' }, pts: () => {
    const f = (t: number): Pos => [16 * Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
    const first = f(0), last = f(Math.PI);
    return [C(first[0], first[1])].concat(curve(f, 0, Math.PI, 90), [C(last[0], last[1])], curve(f, Math.PI, 2 * Math.PI, 90));
  } },
  { id: 'star', name: { hu: 'Csillag', en: 'Star' }, pts: () => {
    const a: Pt[] = [];
    for(let k = 0; k < 10; k++){ const ang = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.40 : 1; a.push(C(Math.cos(ang) * r, Math.sin(ang) * r)); }
    return a;
  } },
  { id: 'house', name: { hu: 'Ház', en: 'House' }, pts: () => [
    C(0.12, 0.92), C(0.12, 0.50), C(0.50, 0.14), C(0.66, 0.29), C(0.66, 0.10), C(0.79, 0.10), C(0.79, 0.41), C(0.88, 0.50), C(0.88, 0.92),
    C(0.60, 0.92), C(0.60, 0.66), C(0.40, 0.66), C(0.40, 0.92)
  ] },
  { id: 'fish', name: { hu: 'Hal', en: 'Fish' }, pts: () => {
    const top = (x: number) => 0.5 - 0.27 * Math.sin(Math.PI * (x - 0.08) / 0.78);
    const N = 40;
    const up: Pt[] = [], dn: Pt[] = [];
    for(let i = 1; i <= N; i++){ const x = 0.08 + 0.62 * i / N; up.push(Sm(x, top(x))); }
    for(let i = N; i >= 1; i--){ const x = 0.08 + 0.62 * i / N; dn.push(Sm(x, 1 - top(x))); }
    const out: Pt[] = [C(0.08, 0.5)].concat(up.slice(0, -1), [Sm(up[up.length - 1][0], up[up.length - 1][1])]);
    out.push(C(0.93, 0.24), C(0.83, 0.5), C(0.93, 0.76));
    return out.concat(dn);
  } },
  { id: 'boat', name: { hu: 'Vitorlás', en: 'Sailboat' }, pts: () => [
    C(0.08, 0.74), C(0.22, 0.92), C(0.78, 0.92), C(0.92, 0.74), C(0.84, 0.74), C(0.57, 0.12), C(0.57, 0.74), C(0.49, 0.74), C(0.49, 0.30), C(0.18, 0.74)
  ] },
  { id: 'rocket', name: { hu: 'Rakéta', en: 'Rocket' }, pts: () => {
    const nose = quad([0.50, 0.04], [0.66, 0.16], [0.66, 0.40], 10);
    const nose2 = quad([0.34, 0.40], [0.34, 0.16], [0.50, 0.04], 10);
    return [C(0.50, 0.04)].concat(nose, [C(0.66, 0.40), C(0.66, 0.72), C(0.84, 0.82), C(0.84, 0.98), C(0.66, 0.90), C(0.34, 0.90), C(0.16, 0.98), C(0.16, 0.82), C(0.34, 0.72), C(0.34, 0.40)], nose2);
  } },
  { id: 'tree', name: { hu: 'Fenyőfa', en: 'Pine tree' }, pts: () => [
    C(0.50, 0.04), C(0.72, 0.30), C(0.62, 0.30), C(0.80, 0.55), C(0.66, 0.55), C(0.88, 0.80), C(0.57, 0.80), C(0.57, 0.97),
    C(0.43, 0.97), C(0.43, 0.80), C(0.12, 0.80), C(0.34, 0.55), C(0.20, 0.55), C(0.38, 0.30), C(0.28, 0.30)
  ] }
];

function polyArea(pts: Pt[]): number {
  let a = 0;
  for(let i = 0; i < pts.length; i++){ const q = pts[(i + 1) % pts.length]; a += pts[i][0] * q[1] - q[0] * pts[i][1]; }
  return a / 2;
}

// Picks N dots from the outline: all corners plus the rest spread evenly between the corners.
export function pickDots(pts: Pt[], N: number): Pos[] {
  const m = pts.length, cum = [0];
  for(let i = 0; i < m; i++){ const q = pts[(i + 1) % m]; cum.push(cum[i] + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1])); }
  const total = cum[m];
  let cs: number[] = []; for(let i = 0; i < m; i++) if(pts[i][2]) cs.push(cum[i]);
  if(cs.length < 2) cs = cs.length ? [cs[0], (cs[0] + total / 2) % total] : [0, total / 2];
  cs.sort((x, y) => x - y);
  interface Piece { st: number; len: number; k: number; exact: number }
  const pieces: Piece[] = cs.map((st, i) => { const en = i + 1 < cs.length ? cs[i + 1] : cs[0] + total; return { st: st, len: en - st, k: 0, exact: 0 }; });
  const rest = Math.max(0, N - cs.length);
  // largest-remainder method: proportional to the piece lengths
  const sumLen = pieces.reduce((x, p) => x + p.len, 0);
  pieces.forEach(p => { p.exact = rest * p.len / sumLen; p.k = Math.floor(p.exact); });
  const left = rest - pieces.reduce((x, p) => x + p.k, 0);
  pieces.slice().sort((x, y) => (y.exact - y.k) - (x.exact - x.k)).slice(0, left).forEach(p => { p.k++; });
  const s: number[] = [];
  pieces.forEach(p => { s.push(p.st % total); for(let j = 1; j <= p.k; j++) s.push((p.st + p.len * j / (p.k + 1)) % total); });
  s.sort((x, y) => x - y);
  return s.map((d): Pos => {
    let i = 0; while(i + 1 < cum.length - 1 && cum[i + 1] < d - 1e-9) i++;
    const q = pts[(i + 1) % m], seg = cum[i + 1] - cum[i], t = seg > 0 ? (d - cum[i]) / seg : 0;
    return [pts[i][0] + (q[0] - pts[i][0]) * t, pts[i][1] + (q[1] - pts[i][1]) * t];
  });
}

export interface Dots { shape: string; name: Record<Lang, string>; pos: Pos[]; step: number; band: number; n: number }

// st: { shape: 'any' | id, step: 0 (by age band) | 1 | 2 | 5 | 10 }
export function genDots(seed: number, band: number, st: { shape: string; step: number }): Dots {
  const B = BANDS[band].dots, rnd = puzzleRng(seed, band, 'dots' + st.shape);
  const shapes = st.shape === 'any' ? DOT_SHAPES : DOT_SHAPES.filter(s => s.id === st.shape);
  const sh = shapes[Math.floor(rnd() * shapes.length)] || DOT_SHAPES[0];
  let pts = sh.pts();
  if(polyArea(pts) < 0) pts = pts.slice().reverse();
  const corners = pts.filter(q => q[2]).length;
  let dots = pickDots(pts, Math.max(B.n, corners + 2));
  // the topmost dot (the one closest to the middle on ties) becomes the first
  let bi = 0;
  const mid = dots.reduce((a, q) => a + q[0], 0) / dots.length;
  dots.forEach((q, i) => { const b = dots[bi]; if(q[1] < b[1] - 1e-6 || (Math.abs(q[1] - b[1]) < 1e-6 && Math.abs(q[0] - mid) < Math.abs(b[0] - mid))) bi = i; });
  dots = dots.slice(bi).concat(dots.slice(0, bi));
  // fit to size
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  dots.forEach(q => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
  const S = 410, sc = S / Math.max(x1 - x0, y1 - y0), ox = (PW - (x1 - x0) * sc) / 2, oy = 50 + (S - (y1 - y0) * sc) / 2;
  const pos = dots.map((q): Pos => [ox + (q[0] - x0) * sc, oy + (q[1] - y0) * sc]);
  const step = st.step || B.step;
  return { shape: sh.id, name: sh.name, pos: pos, step: step, band: band, n: pos.length };
}

export function drawDots(p: Dots, solution: boolean): Op[] {
  const ops: Op[] = [], n = p.n, pos = p.pos;
  if(solution){
    ops.push({ k: 'poly', pts: pos, w: 2.2, close: true });
    pos.forEach(q => ops.push({ k: 'circle', x: q[0], y: q[1], r: 2.6, fill: 0, w: 0 }));
    return ops;
  }
  // average dot gap → label size
  let per = 0; pos.forEach((q, i) => { const r = pos[(i + 1) % n]; per += Math.hypot(r[0] - q[0], r[1] - q[1]); });
  const gap = per / n, size = Math.max(8, Math.min(15, gap * 0.52)), dr = Math.max(2.4, Math.min(4.5, gap * 0.16));
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  pos.forEach((q, i) => {
    const a = pos[(i + n - 1) % n], b = pos[(i + 1) % n];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    let nx = ty, ny = -tx;                        // outward-pointing normal (the shape runs clockwise)
    // at corners the angle bisector points outward: the negated sum of the unit vectors towards the neighbours
    const ua = [a[0] - q[0], a[1] - q[1]], ub = [b[0] - q[0], b[1] - q[1]];
    const la = Math.hypot(ua[0], ua[1]) || 1, lb = Math.hypot(ub[0], ub[1]) || 1;
    const sx = ua[0] / la + ub[0] / lb, sy = ua[1] / la + ub[1] / lb, sl = Math.hypot(sx, sy);
    if(sl > 0.3){
      const cross = (q[0] - a[0]) * (b[1] - q[1]) - (q[1] - a[1]) * (b[0] - q[0]);
      const sg = cross > 0 ? -1 : 1;
      nx = sg * sx / sl; ny = sg * sy / sl;
    }
    const label = String(p.step * (i + 1)), tw = label.length * size * 0.64, th = size;
    let off = dr + size * 0.62 + 2, lx = 0, ly = 0;
    for(let k = 0; k < 5; k++){
      lx = q[0] + nx * off; ly = q[1] + ny * off + size * 0.36;
      const clash = placed.some(r => Math.abs(r.x - lx) < (r.w + tw) / 2 + 1 && Math.abs(r.y - ly) < (r.h + th) / 2 + 1);
      if(!clash) break;
      off += size * 0.55;
    }
    placed.push({ x: lx, y: ly - size * 0.36, w: tw, h: th });
    ops.push({ k: 'circle', x: q[0], y: q[1], r: dr, fill: 0, w: 0 });
    ops.push({ k: 'text', x: lx, y: ly, s: label, size: size, b: true, a: 'c' });
  });
  ops.push({ k: 'circle', x: pos[0][0], y: pos[0][1], r: dr + 5, w: 1.6 });
  return ops;
}
