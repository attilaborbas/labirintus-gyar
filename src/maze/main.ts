import { $, clampInt } from '../shared/dom.ts';
import { LANGS, createI18n, detectLang, isLang } from '../shared/i18n.ts';
import type { Lang } from '../shared/i18n.ts';
import { loadJson, readLangPref, saveJson } from '../shared/storage.ts';
import { savePdf } from '../shared/downloads.ts';
import { BIT, DX, DY, bfs, generate, gridSize, makeMask } from './core.ts';
import type { LevelDef, Shape } from './core.ts';
import { buildPdf } from './pdf.ts';
import type { PdfBatch, PdfMazeStrings } from './pdf.ts';
import { jingle, setSoundEnabled, tone } from './sound.ts';
import { TEXTS } from './texts.ts';

const i18n = createI18n(TEXTS);
const t = i18n.t;

/* ---------- constants ---------- */
// A single black-and-white look: white floor, black walls.
const THEME = { hero: '🦔', goal: '🍎', floor: '#FFFFFF', wall: '#000000', thread: 'rgba(255,107,61,.6)', glow: '255,226,122' };
const LEVELS: LevelDef[] = [
  { n: 5,  braid: 0.7 },
  { n: 8,  braid: 0.3 },
  { n: 12, braid: 0.1 },
  { n: 18, braid: 0 },
  { n: 15, braid: 0.05, custom: true }
];
const CUSTOM = LEVELS.length - 1, BIGGER_MAX = 3, SIZE_MIN = 3, SIZE_MAX = 40;
const CONFETTI = ['#FF6B3D', '#FFD93D', '#17A76B', '#3D7BFF', '#FF7AC8', '#7A5CFF'];

const MODE: 'play' | 'print' = document.body.classList.contains('mode-print') ? 'print' : 'play';
// The pages' settings are independent: each uses its own storage key. Only the language is shared.
const KEY = MODE === 'print' ? 'maze-factory-print' : 'maze-factory-play';

const cv = $<HTMLCanvasElement>('cv');
const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
const sc = document.createElement('canvas');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- state ---------- */
interface Particle { x: number; y: number; vx: number; vy: number; r: number; w: number; h: number; col: string; life: number }
interface GameState {
  level: number; shape: Shape; mask: Uint8Array | null; sound: boolean; totalStars: number; solved: number; langPref: Lang | null;
  seed: number; n: number; walls: Uint8Array | null; start: number; goal: number; pos: number; thread: number[]; steps: number; won: boolean;
  hintUntil: number; showSolution: boolean; usedHint: boolean; usedSolution: boolean; shortest: number;
  disp: { x: number; y: number }; bump: { dir: number; t: number } | null; particles: Particle[]; sol: number[]; solFrom: number;
  lastStars: number; cheer: number;
}
const S: GameState = {
  level: 1, shape: 0, mask: null, sound: true, totalStars: 0, solved: 0, langPref: null,
  seed: 0, n: 0, walls: null, start: 0, goal: 0, pos: 0, thread: [], steps: 0, won: false,
  hintUntil: 0, showSolution: false, usedHint: false, usedSolution: false, shortest: 0,
  disp: { x: 0, y: 0 }, bump: null, particles: [], sol: [], solFrom: -1, lastStars: 3, cheer: 0
};
// Print settings (the batch PDF generator).
const P = { shape: 0 as Shape, counts: [2, 2, 2, 2, 0], per: 1, solutions: true, current: false };
const MAX_EACH = 20, MAX_TOTAL = 40;
let W = 0, pad = 0, cell = 0, wallW = 0, dpr = 1, winTimer = 0, lastBumpSound = 0;

/* ---------- persistence ---------- */
function persist(): void {
  saveJson(KEY, {
    level: S.level, shape: S.shape, sound: S.sound, stars: S.totalStars, solved: S.solved, lang: S.langPref,
    cn: LEVELS[CUSTOM].n, cb: Math.round(LEVELS[CUSTOM].braid * 100),
    pc: P.counts, ps: P.shape, pp: P.per, psol: P.solutions
  }, S.langPref);
}

/* ---------- helpers ---------- */
function announce(msg: string): void { const el = $('live'); el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30); }
function starSvg(on: boolean): string {
  return '<svg viewBox="0 0 24 24"><polygon class="' + (on ? 'star-on' : 'star-off') +
    '" points="12 2.5 14.8 8.8 21.6 9.4 16.5 13.9 18 20.6 12 17.1 6 20.6 7.5 13.9 2.4 9.4 9.2 8.8"/></svg>';
}
function randomSeed(): number { return 1000 + Math.floor(Math.random() * 9000); }
const nm = (b: Element): HTMLElement => b.querySelector('.nm') as HTMLElement;

/* ---------- UI ---------- */
const levelsEl = $('levels');
const levelNameEls: HTMLElement[] = [];
const levelSzEls: HTMLElement[] = [];
LEVELS.forEach((l, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip' + (l.custom ? ' wide' : '');
  b.innerHTML = '<span class="nm"></span><span class="sz">' + l.n + '×' + l.n + '</span>';
  levelNameEls.push(nm(b)); levelSzEls.push(b.querySelector('.sz') as HTMLElement);
  b.addEventListener('click', () => setLevel(i));
  levelsEl.appendChild(b);
});
const SHAPE_SYM = ['■', '●', '♥', '★', '▲'];
const shapesEl = $('shapes'), pdfShapesEl = $('pdfShapes'), shapeNameEls: HTMLElement[] = [];
function makeShapeChips(host: HTMLElement, onPick: (i: number) => void): void {
  SHAPE_SYM.forEach((sym, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip';
    b.innerHTML = '<span class="sh" aria-hidden="true">' + sym + '</span><span class="nm"></span>';
    shapeNameEls.push(nm(b));
    b.addEventListener('click', () => onPick(i));
    host.appendChild(b);
  });
}
makeShapeChips(shapesEl, i => setShape(i));
makeShapeChips(pdfShapesEl, i => { P.shape = i; persist(); updateExportUI(); });
function updateChips(): void {
  Array.from(shapesEl.children).forEach((b, i) => b.setAttribute('aria-pressed', String(i === S.shape)));
  levelSzEls.forEach((el, i) => { const g = gridSize(LEVELS[i], S.shape); el.textContent = g + '×' + g; });
  Array.from(levelsEl.children).forEach((b, i) => b.setAttribute('aria-pressed', String(i === S.level)));
}
function updateStats(): void { $('steps').textContent = String(S.steps); $('totalStars').textContent = String(S.totalStars); }
function updateSound(): void {
  $('soundBtn').setAttribute('aria-pressed', String(S.sound));
  $('sndOn').hidden = !S.sound; $('sndOff').hidden = S.sound;
}
function updateSolveBtn(): void {
  $('solveBtn').setAttribute('aria-pressed', String(S.showSolution));
  $('solveLbl').textContent = S.showSolution ? t('solveHide') : t('solve');
}
function applyQuest(): void {
  $('quest').textContent = t('quest');
  updateChips();
  if(W && S.walls) renderStatic();
}

/* ---------- building the maze ---------- */
function build(): void {
  const L = LEVELS[S.level], gn = gridSize(L, S.shape);
  const mask = makeMask(S.shape, gn), m = generate(gn, S.seed, L.braid, mask, S.shape);
  clearTimeout(winTimer);
  S.mask = mask; S.n = gn; S.walls = m.walls; S.start = m.start; S.goal = m.goal;
  S.pos = m.start; S.thread = [m.start]; S.steps = 0; S.won = false;
  S.hintUntil = 0; S.showSolution = false; S.usedHint = false; S.usedSolution = false;
  S.solFrom = -1; S.bump = null; S.particles = [];
  S.shortest = (bfs(S.walls, S.n, S.start, S.goal) as number[]).length - 1;
  S.disp = { x: S.start % S.n, y: (S.start / S.n) | 0 };
  $('win').hidden = true;
  $('customBox').hidden = MODE === 'print' ? false : !L.custom; syncCustomUI();
  $<HTMLInputElement>('seedIn').value = String(S.seed); $('seedMsg').textContent = '';
  updateStats(); updateSolveBtn(); applyQuest(); layout();
  updateExportUI();
  announce(t('newMazeAnn', gn, S.seed));
}
function canGoBigger(): boolean { return S.level < BIGGER_MAX || (S.level === CUSTOM && LEVELS[CUSTOM].n < SIZE_MAX); }
function setShape(i: number): void { S.shape = i; persist(); S.seed = randomSeed(); build(); }
function setLevel(i: number): void { S.level = i; persist(); S.seed = randomSeed(); build(); }

/* ---------- drawing ---------- */
function layout(): void {
  const r = cv.getBoundingClientRect(), w = Math.floor(r.width);
  if(w < 40 || !S.walls) return;
  W = w; dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = Math.round(W * dpr); cv.height = Math.round(W * dpr);
  wallW = Math.max(2, Math.min(9, (W / S.n) * 0.14));
  pad = wallW / 2 + 6; cell = (W - 2 * pad) / S.n;
  renderStatic();
}

// The static layer (floor and walls) is drawn once into an offscreen canvas.
function renderStatic(): void {
  const walls = S.walls as Uint8Array, n = S.n;
  sc.width = cv.width; sc.height = cv.height;
  const c = sc.getContext('2d') as CanvasRenderingContext2D;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const mk = S.mask, inM = (i: number) => !mk || mk[i] === 1;
  c.fillStyle = THEME.floor; c.fillRect(0, 0, W, W);
  if(mk){ c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, 0, W, W); }
  c.fillStyle = THEME.floor;
  for(let y = 0; y < n; y++) for(let x = 0; x < n; x++){
    if(!inM(y * n + x)) continue;
    c.fillRect(pad + x * cell, pad + y * cell, cell + 0.5, cell + 0.5);
  }
  const path = new Path2D();
  for(let y = 0; y < n; y++) for(let x = 0; x < n; x++){
    const i = y * n + x;
    if(!inM(i)) continue;
    const k = walls[i], x0 = pad + x * cell, y0 = pad + y * cell;
    if((k & 1) && (y === 0 || !inM(i - n))){ path.moveTo(x0, y0); path.lineTo(x0 + cell, y0); }
    if(k & 2){ path.moveTo(x0 + cell, y0); path.lineTo(x0 + cell, y0 + cell); }
    if(k & 4){ path.moveTo(x0, y0 + cell); path.lineTo(x0 + cell, y0 + cell); }
    if((k & 8) && (x === 0 || !inM(i - 1))){ path.moveTo(x0, y0); path.lineTo(x0, y0 + cell); }
  }
  c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = wallW;
  c.strokeStyle = THEME.wall; c.stroke(path);
}

function emoji(ch: string, x: number, y: number, size: number): void {
  ctx.font = size + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y + size * 0.06);
}

function draw(ts: number): void {
  if(!W || !S.walls) return;
  const n = S.n, now = performance.now();
  const C = (x: number, y: number): [number, number] => [pad + (x + 0.5) * cell, pad + (y + 0.5) * cell];
  const pulse = reduced ? 0.5 : Math.sin(ts / 280) * 0.5 + 0.5;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, W);
  ctx.drawImage(sc, 0, 0, W, W);

  // start marker
  const st = C(S.start % n, (S.start / n) | 0);
  ctx.save(); ctx.setLineDash([cell * 0.12, cell * 0.1]); ctx.lineWidth = 2; ctx.strokeStyle = THEME.wall; ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.arc(st[0], st[1], cell * 0.36, 0, 6.2832); ctx.stroke(); ctx.restore();

  // goal glow
  const g = C(S.goal % n, (S.goal / n) | 0);
  const grad = ctx.createRadialGradient(g[0], g[1], 0, g[0], g[1], cell * 0.8);
  grad.addColorStop(0, 'rgba(' + THEME.glow + ',' + (0.55 + 0.3 * pulse) + ')');
  grad.addColorStop(1, 'rgba(' + THEME.glow + ',0)');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(g[0], g[1], cell * 0.8, 0, 6.2832); ctx.fill();

  // Ariadne's thread
  if(S.thread.length >= 2){
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, cell * 0.2); ctx.strokeStyle = THEME.thread;
    ctx.beginPath();
    for(let i = 0; i < S.thread.length - 1; i++){
      const p = C(S.thread[i] % n, (S.thread[i] / n) | 0);
      if(i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    }
    const dp = C(S.disp.x, S.disp.y); ctx.lineTo(dp[0], dp[1]);
    ctx.stroke(); ctx.restore();
  }

  // hint and solution
  const hintOn = now < S.hintUntil;
  if((hintOn || S.showSolution) && !S.won){
    if(S.solFrom !== S.pos){ S.sol = bfs(S.walls, n, S.pos, S.goal) || []; S.solFrom = S.pos; }
    const part = S.showSolution ? S.sol.slice(1, -1) : S.sol.slice(1, 7).filter(c => c !== S.goal);
    ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = THEME.wall; ctx.lineWidth = 2.5;
    for(const c of part){
      const p = C(c % n, (c / n) | 0);
      ctx.beginPath(); ctx.arc(p[0], p[1], cell * (0.09 + 0.04 * pulse), 0, 6.2832); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // goal and character
  const size = Math.max(9, cell * 0.7);
  const bob = reduced ? 0 : Math.sin(ts / 380) * cell * 0.035;
  emoji(THEME.goal, g[0], g[1] + bob, size);

  const tx = S.pos % n, ty = (S.pos / n) | 0;
  const p = C(S.disp.x, S.disp.y);
  let bx = 0, by = 0;
  if(S.bump){
    const q = (now - S.bump.t) / 180;
    if(q >= 1) S.bump = null;
    else { const o = Math.sin(q * Math.PI) * cell * 0.14; bx = DX[S.bump.dir] * o; by = DY[S.bump.dir] * o; }
  }
  const dist = Math.min(1, Math.hypot(tx - S.disp.x, ty - S.disp.y));
  const hop = reduced ? 0 : Math.sin(dist * Math.PI) * cell * 0.12;
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.beginPath(); ctx.ellipse(p[0] + bx, p[1] + by + cell * 0.3, cell * 0.26, cell * 0.08, 0, 0, 6.2832); ctx.fill();
  ctx.fillStyle = '#000';
  emoji(THEME.hero, p[0] + bx, p[1] + by - hop, size);

  // confetti
  for(const k of S.particles){
    ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.r); ctx.fillStyle = k.col;
    ctx.fillRect(-k.w / 2, -k.h / 2, k.w, k.h); ctx.restore();
  }
}

function update(dt: number): void {
  if(!S.walls) return;
  const tx = S.pos % S.n, ty = (S.pos / S.n) | 0;
  if(reduced){ S.disp.x = tx; S.disp.y = ty; }
  else {
    const k = 1 - Math.exp(-dt * 16);
    S.disp.x += (tx - S.disp.x) * k; S.disp.y += (ty - S.disp.y) * k;
    if(Math.abs(tx - S.disp.x) < 0.004) S.disp.x = tx;
    if(Math.abs(ty - S.disp.y) < 0.004) S.disp.y = ty;
  }
  for(let i = S.particles.length - 1; i >= 0; i--){
    const k = S.particles[i];
    k.vy += 120 * dt; k.x += k.vx * dt; k.y += k.vy * dt; k.r += dt * 5; k.life -= dt;
    if(k.life <= 0 || k.y > W + 20) S.particles.splice(i, 1);
  }
}

let lastTs = 0;
function frame(ts: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016); lastTs = ts;
  update(dt); draw(ts);
}

function confetti(): void {
  if(reduced) return;
  for(let i = 0; i < 110; i++){
    S.particles.push({
      x: Math.random() * W, y: -10 - Math.random() * W * 0.4,
      vx: (Math.random() - 0.5) * 120, vy: 60 + Math.random() * 140,
      r: Math.random() * 6, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4,
      col: CONFETTI[i % CONFETTI.length], life: 2.8 + Math.random() * 1.2
    });
  }
}

/* ---------- gameplay ---------- */
function move(dir: number): boolean {
  if(S.won || !S.walls) return false;
  if(S.walls[S.pos] & BIT[dir]){
    const now = performance.now();
    S.bump = { dir: dir, t: now };
    if(now - lastBumpSound > 260){ tone(150, 0.1, 'triangle', 0.07); lastBumpSound = now; }
    return false;
  }
  const np = S.pos + DY[dir] * S.n + DX[dir], th = S.thread;
  if(th.length >= 2 && th[th.length - 2] === np) th.pop(); else th.push(np);
  S.pos = np; S.steps++;
  $('steps').textContent = String(S.steps);
  if(np === S.goal) win();
  return true;
}

function fillWin(): void {
  const stars = S.lastStars;
  $('winHero').textContent = THEME.hero + ' ' + THEME.goal;
  $('winTitle').textContent = i18n.list('cheers')[S.cheer % 4];
  $('winText').textContent = t('found');
  $('winStars').innerHTML = starSvg(stars >= 1) + starSvg(stars >= 2) + starSvg(stars >= 3);
  $('winStarText').textContent = t('stars' + stars);
  $('winMeta').textContent = t('meta', S.steps, S.shortest);
  $('winBigger').hidden = !canGoBigger();
}

function win(): void {
  S.won = true; stopDrag();
  S.lastStars = S.usedSolution ? 1 : S.usedHint ? 2 : 3;
  S.cheer = Math.floor(Math.random() * 4);
  S.totalStars += S.lastStars; S.solved++; persist(); updateStats();
  fillWin();
  announce(t('found') + ' ' + t('stars' + S.lastStars));
  winTimer = window.setTimeout(() => {
    $('win').hidden = false; confetti(); jingle();
    $('winNew').focus({ preventScroll: true });
  }, 420);
}

function restart(): void {
  clearTimeout(winTimer);
  S.pos = S.start; S.thread = [S.start]; S.steps = 0; S.won = false; S.bump = null; S.solFrom = -1;
  S.disp = { x: S.start % S.n, y: (S.start / S.n) | 0 };
  $('win').hidden = true; updateStats();
}

/* ---------- controls ---------- */
const KEYS: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3 };
window.addEventListener('keydown', e => {
  if(e.metaKey || e.ctrlKey || e.altKey) return;
  const tg = e.target as HTMLElement | null;
  if(tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return;
  if(Object.prototype.hasOwnProperty.call(KEYS, e.key)){ e.preventDefault(); move(KEYS[e.key]); }
});

document.querySelectorAll<HTMLElement>('.dp').forEach(b => {
  const dir = Number(b.dataset.dir);
  let timer: number | null = null, delay: number | null = null;
  const stop = () => { if(timer !== null) clearInterval(timer); if(delay !== null) clearTimeout(delay); timer = null; delay = null; };
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch(err){ /* ignore */ }
    move(dir);
    delay = window.setTimeout(() => { timer = window.setInterval(() => move(dir), 120); }, 320);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => b.addEventListener(ev, stop));
  b.addEventListener('click', e => { if(e.detail === 0) move(dir); });
});

// drag a finger or the mouse along the path
let dragId: number | null = null, dragCell = -1, dragTimer: number | null = null;
function cellAt(e: PointerEvent): number {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) * (W / r.width), y = (e.clientY - r.top) * (W / r.height);
  const cx = Math.floor((x - pad) / cell), cy = Math.floor((y - pad) / cell);
  if(cx < 0 || cy < 0 || cx >= S.n || cy >= S.n) return -1;
  const i = cy * S.n + cx;
  return (S.mask && !S.mask[i]) ? -1 : i;
}
function follow(): void {
  if(S.won || dragCell < 0 || dragCell === S.pos || !S.walls) return;
  const p = bfs(S.walls, S.n, S.pos, dragCell);
  if(!p || p.length - 1 > 6) return;
  const diff = p[1] - S.pos;
  const dir = diff === -S.n ? 0 : diff === 1 ? 1 : diff === S.n ? 2 : 3;
  move(dir);
}
function stopDrag(): void { dragId = null; if(dragTimer !== null) clearInterval(dragTimer); dragTimer = null; }
cv.addEventListener('pointerdown', e => {
  if(S.won) return;
  try { cv.setPointerCapture(e.pointerId); } catch(err){ /* ignore */ }
  dragId = e.pointerId; dragCell = cellAt(e);
  follow(); if(dragTimer !== null) clearInterval(dragTimer); dragTimer = window.setInterval(follow, 85);
});
cv.addEventListener('pointermove', e => { if(e.pointerId === dragId) dragCell = cellAt(e); });
['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, e => { if((e as PointerEvent).pointerId === dragId) stopDrag(); }));

$('newBtn').addEventListener('click', () => { S.seed = randomSeed(); build(); tone(440, 0.08, 'sine', 0.06); });
$('winNew').addEventListener('click', () => { S.seed = randomSeed(); build(); });
$('winBigger').addEventListener('click', () => {
  if(S.level < BIGGER_MAX) setLevel(S.level + 1);
  else if(S.level === CUSTOM && LEVELS[CUSTOM].n < SIZE_MAX){
    LEVELS[CUSTOM].n = Math.min(SIZE_MAX, LEVELS[CUSTOM].n + 3); persist(); S.seed = randomSeed(); build();
  }
});
$('resetBtn').addEventListener('click', restart);
$('hintBtn').addEventListener('click', () => {
  if(S.won) return;
  S.usedHint = true; S.hintUntil = performance.now() + 3500;
  tone(880, 0.1, 'sine', 0.06); tone(1175, 0.12, 'sine', 0.06, 0.09);
  announce(t('hintAnn'));
});
$('solveBtn').addEventListener('click', () => {
  if(S.won) return;
  S.showSolution = !S.showSolution;
  if(S.showSolution) S.usedSolution = true;
  updateSolveBtn();
});
$('soundBtn').addEventListener('click', () => { S.sound = !S.sound; setSoundEnabled(S.sound); persist(); updateSound(); if(S.sound) tone(660, 0.1, 'sine', 0.06); });
$('seedForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = parseInt($<HTMLInputElement>('seedIn').value, 10);
  if(!(v >= 1 && v <= 9999)){ $('seedMsg').textContent = t('seedErr'); return; }
  S.seed = v; build();
});

/* ---------- PDF export ---------- */
const countsEl = $('counts'), perEl = $('perChips');
const cntOut: HTMLElement[] = [], minusBtns: HTMLButtonElement[] = [], plusBtns: HTMLButtonElement[] = [], crNames: HTMLElement[] = [], crSizes: HTMLElement[] = [];
LEVELS.forEach((L, i) => {
  const row = document.createElement('div'); row.className = 'count-row';
  row.innerHTML = '<div class="cr-name"><span class="nm"></span><span class="sz">' + L.n + '×' + L.n + '</span></div>' +
    '<div class="stepper"><button class="btn step" type="button">−</button><output>0</output><button class="btn step" type="button">+</button></div>';
  const bs = row.querySelectorAll('button');
  crNames.push(nm(row)); crSizes.push(row.querySelector('.sz') as HTMLElement);
  cntOut.push(row.querySelector('output') as HTMLElement); minusBtns.push(bs[0]); plusBtns.push(bs[1]);
  bs[0].addEventListener('click', () => { P.counts[i] = Math.max(0, P.counts[i] - 1); persist(); updateExportUI(); });
  bs[1].addEventListener('click', () => { if(P.counts[i] < MAX_EACH && exportTotal() < MAX_TOTAL){ P.counts[i]++; persist(); updateExportUI(); } });
  countsEl.appendChild(row);
});
[1, 2, 4].forEach(v => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.textContent = String(v);
  b.addEventListener('click', () => { P.per = v; persist(); updateExportUI(); });
  perEl.appendChild(b);
});
$('optSol').addEventListener('change', e => { P.solutions = (e.target as HTMLInputElement).checked; persist(); updateExportUI(); });
$('optCur').addEventListener('change', e => { P.current = (e.target as HTMLInputElement).checked; updateExportUI(); });

function levelName(i: number): string { return i18n.list('levels')[i]; }
function exportTotal(): number { return P.counts.reduce((a, b) => a + b, 0) + (P.current ? 1 : 0); }
function exportPages(): number {
  let pages = 0;
  LEVELS.forEach((_L, i) => {
    const c = P.counts[i] + (P.current && i === S.level ? 1 : 0);
    pages += Math.ceil(c / P.per);
  });
  if(P.solutions) pages += Math.ceil(exportTotal() / 6);
  return pages;
}
function updateExportUI(): void {
  const total = exportTotal();
  LEVELS.forEach((L, i) => {
    crNames[i].textContent = levelName(i);
    const g = gridSize(L, P.shape); crSizes[i].textContent = g + '×' + g;
    cntOut[i].textContent = String(P.counts[i]);
    cntOut[i].setAttribute('aria-label', t('countAria', levelName(i)));
    minusBtns[i].setAttribute('aria-label', t('less', levelName(i)));
    plusBtns[i].setAttribute('aria-label', t('more', levelName(i)));
    minusBtns[i].disabled = P.counts[i] <= 0;
    plusBtns[i].disabled = P.counts[i] >= MAX_EACH || total >= MAX_TOTAL;
  });
  Array.from(pdfShapesEl.children).forEach((b, i) => b.setAttribute('aria-pressed', String(i === P.shape)));
  Array.from(perEl.children).forEach((b, i) => {
    const v = [1, 2, 4][i];
    b.setAttribute('aria-pressed', String(v === P.per));
    b.setAttribute('aria-label', t('perAria', v));
  });
  $('pdfSum').textContent = total ? t('printSum', total, exportPages()) : t('printNone');
  $<HTMLButtonElement>('pdfBtn').disabled = total === 0;
}

function shapedName(levelIndex: number, shape: Shape): string {
  return levelName(levelIndex) + (shape ? ' · ' + i18n.list('shapes')[shape] : '');
}
function planBatches(): PdfBatch[] {
  return LEVELS.map((L, i) => {
    const seeds: number[] = [], used = new Set<number>();
    if(P.current && i === S.level && P.shape === S.shape){ seeds.push(S.seed); used.add(S.seed); }
    for(let k = 0; k < P.counts[i];){
      const sd = randomSeed();
      if(!used.has(sd)){ used.add(sd); seeds.push(sd); k++; }
    }
    return { name: shapedName(i, P.shape), n: gridSize(L, P.shape), shape: P.shape, braid: L.braid, custom: !!L.custom, seeds: seeds };
  }).filter(b => b.seeds.length);
}
function pdfStrings(): PdfMazeStrings {
  return {
    brand: t('brand'), title: t('pdfTitle'), name: t('pdfName'), instr: t('pdfInstr'), solSub: t('pdfSolSub'),
    start: t('pdfStart'), goal: t('pdfGoal'), footer: t('pdfFooter'),
    caption: (level, n, seed) => t('pdfCaption', level, n, seed)
  };
}

let pdfMsgKey: string | null = null, pdfMsgErr = false;
function pdfMessage(key: string | null, isErr: boolean): void {
  pdfMsgKey = key; pdfMsgErr = isErr;
  ['pdfMsg', 'oneMsg'].forEach(id => { const m = $(id); m.textContent = key ? t(key) : ''; m.classList.toggle('err', pdfMsgErr); });
}

// Runs a PDF job with the shared busy/message handling.
async function makePdf(btn: HTMLButtonElement, job: () => { buf: ArrayBuffer; filename: string }): Promise<void> {
  if(!window.jspdf){ pdfMessage('pdfNoLib', true); return; }
  btn.disabled = true; pdfMessage('pdfMaking', false);
  await new Promise(r => setTimeout(r, 40));
  try {
    const out = job();
    savePdf(out.buf, out.filename);
    pdfMessage('pdfSaved', false);
  } catch(err){
    pdfMessage('pdfFail', true);
  } finally { btn.disabled = false; updateExportUI(); }
}
const fonts = { reg: __FONT_REG__, bold: __FONT_BOLD__ };
$('pdfBtn').addEventListener('click', () => makePdf($<HTMLButtonElement>('pdfBtn'), () => ({
  buf: buildPdf((window.jspdf as NonNullable<Window['jspdf']>).jsPDF, fonts, planBatches(), { per: P.per, solutions: P.solutions, tx: pdfStrings() }),
  filename: 'maze-factory-' + i18n.lang + '.pdf'
})));
$('printOne').addEventListener('click', () => makePdf($<HTMLButtonElement>('printOne'), () => {
  const L = LEVELS[S.level];
  const batch: PdfBatch = { name: shapedName(S.level, S.shape), n: S.n, shape: S.shape, braid: L.braid, custom: !!L.custom, seeds: [S.seed] };
  return {
    buf: buildPdf((window.jspdf as NonNullable<Window['jspdf']>).jsPDF, fonts, [batch], { per: 1, solutions: true, tx: pdfStrings() }),
    filename: 'maze-' + S.seed + '-' + i18n.lang + '.pdf'
  };
}));

/* ---------- custom level ---------- */
const sizeRange = $<HTMLInputElement>('sizeRange'), sizeNum = $<HTMLInputElement>('sizeNum');
const routeRange = $<HTMLInputElement>('routeRange'), routeNum = $<HTMLInputElement>('routeNum');
let customTimer = 0;
function clampNum(v: string, lo: number, hi: number): number | null { const r = Math.round(Number(v)); return isFinite(r) ? Math.max(lo, Math.min(hi, r)) : null; }
function syncCustomUI(skip?: HTMLInputElement): void {
  const L = LEVELS[CUSTOM], pct = Math.round(L.braid * 100);
  if(skip !== sizeNum) sizeNum.value = String(L.n);
  if(skip !== routeNum) routeNum.value = String(pct);
  sizeRange.value = String(L.n); routeRange.value = String(pct);
  const gs = gridSize(L, S.shape), gp = gridSize(L, P.shape);
  levelSzEls[CUSTOM].textContent = gs + '×' + gs;
  crSizes[CUSTOM].textContent = gp + '×' + gp;
}
function applyCustom(n: number | null, pct: number | null, source?: HTMLInputElement): void {
  const L = LEVELS[CUSTOM];
  if(n !== null) L.n = n;
  if(pct !== null) L.braid = pct / 100;
  syncCustomUI(source); persist();
  clearTimeout(customTimer);
  customTimer = window.setTimeout(() => { if(S.level === CUSTOM) build(); }, 140);
}
sizeRange.addEventListener('input', () => applyCustom(clampNum(sizeRange.value, SIZE_MIN, SIZE_MAX), null, sizeRange));
routeRange.addEventListener('input', () => applyCustom(null, clampNum(routeRange.value, 0, 100), routeRange));
// typed numbers apply while they are valid; out-of-range values are fixed when the field loses focus
sizeNum.addEventListener('input', () => {
  const v = Math.round(Number(sizeNum.value));
  if(sizeNum.value !== '' && v >= SIZE_MIN && v <= SIZE_MAX) applyCustom(v, null, sizeNum);
});
routeNum.addEventListener('input', () => {
  const v = Math.round(Number(routeNum.value));
  if(routeNum.value !== '' && v >= 0 && v <= 100) applyCustom(null, v, routeNum);
});
sizeNum.addEventListener('change', () => { const v = clampNum(sizeNum.value, SIZE_MIN, SIZE_MAX); applyCustom(v === null ? LEVELS[CUSTOM].n : v, null); });
routeNum.addEventListener('change', () => { const v = clampNum(routeNum.value, 0, 100); applyCustom(null, v === null ? Math.round(LEVELS[CUSTOM].braid * 100) : v); });

/* ---------- language selector ---------- */
const langSel = $<HTMLSelectElement>('langSel');
LANGS.forEach(l => {
  const o = document.createElement('option'); o.value = l[0]; o.textContent = l[1]; langSel.appendChild(o);
});
function applyI18n(): void {
  const lang = i18n.lang;
  document.documentElement.lang = lang;
  document.querySelectorAll<HTMLElement>('[data-t]').forEach(el => { el.textContent = t(el.dataset.t as string); });
  document.querySelectorAll<HTMLElement>('[data-t-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.tAria as string)); });
  levelNameEls.forEach((el, i) => { el.textContent = levelName(i); });
  shapeNameEls.forEach((el, i) => { el.textContent = i18n.list('shapes')[i % 5]; });
  updateChips();
  if(MODE === 'print') document.title = t('brand') + ' · ' + t('printTitle');
  document.querySelectorAll<HTMLElement>('.navlink').forEach(a => { if(a.dataset.nav === MODE) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  langSel.value = lang; $('langCode').textContent = lang.toUpperCase();
  $('quest').textContent = t('quest');
  updateSolveBtn(); updateExportUI();
  if(pdfMsgKey) pdfMessage(pdfMsgKey, pdfMsgErr);
  if(!$('win').hidden) fillWin();
}
langSel.addEventListener('change', () => {
  const v = langSel.value;
  i18n.set(isLang(v) ? v : 'en');
  S.langPref = i18n.lang; persist(); applyI18n();
});

/* ---------- startup ---------- */
const saved = loadJson(KEY);
S.level = clampInt(saved.level, 0, LEVELS.length - 1, 1);
S.shape = clampInt(saved.shape, 0, 4, 0);
P.shape = clampInt(saved.ps, 0, 4, 0);
P.per = [1, 2, 4].indexOf(saved.pp as number) >= 0 ? saved.pp as number : 1;
P.solutions = saved.psol !== false;
$<HTMLInputElement>('optSol').checked = P.solutions;
if(Array.isArray(saved.pc) && saved.pc.length === LEVELS.length){
  const pc = saved.pc.map(v => clampInt(v, 0, MAX_EACH, 0));
  if(pc.reduce((a, b) => a + b, 0) <= MAX_TOTAL) P.counts = pc;
}
if(MODE === 'print') $('printCustomSlot').appendChild($('customBox'));
S.sound = saved.sound !== false;
setSoundEnabled(S.sound);
S.totalStars = clampInt(saved.stars, 0, 1e6, 0);
S.solved = clampInt(saved.solved, 0, 1e6, 0);
S.langPref = readLangPref() || (isLang(saved.lang) ? saved.lang : null);
LEVELS[CUSTOM].n = clampInt(saved.cn, SIZE_MIN, SIZE_MAX, LEVELS[CUSTOM].n);
LEVELS[CUSTOM].braid = clampInt(saved.cb, 0, 100, Math.round(LEVELS[CUSTOM].braid * 100)) / 100;
i18n.set(detectLang(S.langPref));
S.seed = randomSeed();
updateSound();
applyI18n();
build();
if(typeof ResizeObserver === 'function') new ResizeObserver(layout).observe($('stage'));
else window.addEventListener('resize', layout);
requestAnimationFrame(frame);
