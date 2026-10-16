import { mulberry32, shuffle } from '../shared/random.ts';

export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];   // 0 up, 1 right, 2 down, 3 left
export const BIT = [1, 2, 4, 8], OPP = [4, 8, 1, 2];

function popcount(v: number): number { return (v & 1) + ((v >> 1) & 1) + ((v >> 2) & 1) + ((v >> 3) & 1); }

// ---- shapes: a mask filters the grid cells
// 0 = square, 1 = circle, 2 = heart, 3 = star, 4 = triangle
export type Shape = number;
type Pt = [number, number];
function inPoly(px: number, py: number, pts: Pt[]): boolean {
  let c = false;
  for(let i = 0, j = pts.length - 1; i < pts.length; j = i++){
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const STAR_PTS: Pt[] = (function(){
  const pts: Pt[] = [];
  for(let k = 0; k < 10; k++){
    const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.28 : 0.52;
    pts.push([0.5 + r * Math.cos(a), 0.54 + r * Math.sin(a)]);
  }
  return pts;
})();
function insideShape(shape: Shape, u: number, v: number): boolean {
  switch(shape){
    case 1: { const dx = u - 0.5, dy = v - 0.5; return dx * dx + dy * dy <= 0.2401; }
    case 2: { const x = (u - 0.5) * 2.4, y = (0.5 - v) * 2.4 + 0.12, a = x * x + y * y - 1; return a * a * a - x * x * y * y * y <= 0; }
    case 3: return inPoly(u, v, STAR_PTS);
    case 4: return v >= 0.04 && Math.abs(u - 0.5) <= (v - 0.04) / 0.92 * 0.47;
    default: return true;
  }
}
// shape 0 = square (no mask). Returns a Uint8Array: the largest connected region.
export function makeMask(shape: Shape, n: number): Uint8Array | null {
  if(!shape) return null;
  const m = new Uint8Array(n * n);
  for(let y = 0; y < n; y++) for(let x = 0; x < n; x++) m[y * n + x] = insideShape(shape, (x + 0.5) / n, (y + 0.5) / n) ? 1 : 0;
  const comp = new Int32Array(n * n).fill(-1);
  let best = -1, bestSize = 0, id = 0;
  for(let i = 0; i < n * n; i++){
    if(!m[i] || comp[i] !== -1) continue;
    const q = [i]; comp[i] = id; let size = 0;
    while(q.length){
      const c = q.pop() as number; size++;
      const cx = c % n, cy = (c / n) | 0;
      for(let d = 0; d < 4; d++){
        const nx = cx + DX[d], ny = cy + DY[d];
        if(nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const ni = ny * n + nx;
        if(m[ni] && comp[ni] === -1){ comp[ni] = id; q.push(ni); }
      }
    }
    if(size > bestSize){ bestSize = size; best = id; }
    id++;
  }
  const out = new Uint8Array(n * n);
  for(let i = 0; i < n * n; i++) if(comp[i] === best) out[i] = 1;
  return out;
}
export interface LevelDef { n: number; braid: number; custom?: boolean }
// Shaped grids are larger so that the shape is clearly visible.
export function gridSize(L: LevelDef, shape: Shape): number {
  if(!shape) return L.n;
  return L.custom ? Math.max(L.n, 7) : Math.max(9, Math.round(L.n * 1.5));
}
function distFrom(walls: Uint8Array, n: number, from: number): Int32Array {
  const dist = new Int32Array(n * n).fill(-1), q = [from]; dist[from] = 0;
  let h = 0;
  while(h < q.length){
    const c = q[h++], cx = c % n, cy = (c / n) | 0;
    for(let d = 0; d < 4; d++){
      if(walls[c] & BIT[d]) continue;
      const ni = (cy + DY[d]) * n + cx + DX[d];
      if(dist[ni] === -1){ dist[ni] = dist[c] + 1; q.push(ni); }
    }
  }
  return dist;
}
// With a shape, START is a cell in the top row and GOAL one in the bottom row, so their labels fall outside the maze.
export function maskRows(mask: Uint8Array, n: number): [number, number] {
  let lo = n, hi = 0;
  for(let i = 0; i < n * n; i++) if(mask[i]){ const r = (i / n) | 0; if(r < lo) lo = r; if(r > hi) hi = r; }
  return [lo, hi];
}

export interface Maze { walls: Uint8Array; start: number; goal: number }

// Depth-first carving: long winding paths. "braid" opens a share of the dead ends
// so younger children get more than one way to the goal.
export function generate(n: number, seed: number, braid: number, mask: Uint8Array | null, shape: Shape): Maze {
  const rnd = mulberry32(seed * 7919 + n * 104729 + (shape || 0) * 15485863);
  const walls = new Uint8Array(n * n).fill(15);
  const seen = new Uint8Array(n * n);
  const cells: number[] = [];
  for(let i = 0; i < n * n; i++) if(!mask || mask[i]) cells.push(i);
  const first = cells[Math.floor(rnd() * cells.length)];
  const stack = [first]; seen[first] = 1;
  while(stack.length){
    const c = stack[stack.length - 1], cx = c % n, cy = (c / n) | 0;
    const opts: number[] = [];
    for(let d = 0; d < 4; d++){
      const nx = cx + DX[d], ny = cy + DY[d];
      if(nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      if(!seen[ny * n + nx] && (!mask || mask[ny * n + nx])) opts.push(d);
    }
    if(!opts.length){ stack.pop(); continue; }
    const d = opts[Math.floor(rnd() * opts.length)];
    const ni = (cy + DY[d]) * n + cx + DX[d];
    walls[c] &= ~BIT[d]; walls[ni] &= ~OPP[d];
    seen[ni] = 1; stack.push(ni);
  }
  if(braid > 0){
    const order = shuffle(cells.slice(), rnd);
    for(const c of order){
      if(popcount(~walls[c] & 15) !== 1) continue;
      if(rnd() >= braid) continue;
      const cx = c % n, cy = (c / n) | 0, cand: number[] = [];
      for(let d = 0; d < 4; d++){
        const nx = cx + DX[d], ny = cy + DY[d];
        if(nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        if((walls[c] & BIT[d]) && (!mask || mask[ny * n + nx])) cand.push(d);
      }
      const dead = cand.filter(d => popcount(~walls[(cy + DY[d]) * n + cx + DX[d]] & 15) === 1);
      const pool = dead.length ? dead : cand;
      if(!pool.length) continue;
      const d = pool[Math.floor(rnd() * pool.length)];
      const ni = (cy + DY[d]) * n + cx + DX[d];
      walls[c] &= ~BIT[d]; walls[ni] &= ~OPP[d];
    }
  }
  if(mask){
    const rr = maskRows(mask, n), top: number[] = [], bot: number[] = [];
    cells.forEach(i => { const r = (i / n) | 0; if(r === rr[0]) top.push(i); if(r === rr[1]) bot.push(i); });
    const a = top[Math.floor(rnd() * top.length)], dd = distFrom(walls, n, a);
    let b = bot[0];
    bot.forEach(i => { if(dd[i] > dd[b]) b = i; });
    return rnd() < 0.5 ? { walls: walls, start: a, goal: b } : { walls: walls, start: b, goal: a };
  }
  const corners = [[0, n * n - 1], [n * n - 1, 0], [n - 1, n * (n - 1)], [n * (n - 1), n - 1]];
  const pair = corners[Math.floor(rnd() * 4)];
  return { walls: walls, start: pair[0], goal: pair[1] };
}

export function bfs(walls: Uint8Array, n: number, from: number, to: number): number[] | null {
  const prev = new Int32Array(n * n).fill(-1), q = new Int32Array(n * n);
  let h = 0, t = 0;
  q[t++] = from; prev[from] = from;
  while(h < t){
    const c = q[h++];
    if(c === to) break;
    const cx = c % n, cy = (c / n) | 0;
    for(let d = 0; d < 4; d++){
      if(walls[c] & BIT[d]) continue;
      const ni = (cy + DY[d]) * n + cx + DX[d];
      if(prev[ni] !== -1) continue;
      prev[ni] = c; q[t++] = ni;
    }
  }
  if(prev[to] === -1) return null;
  const path: number[] = [];
  for(let c = to;; c = prev[c]){ path.push(c); if(c === from) break; }
  return path.reverse();
}
