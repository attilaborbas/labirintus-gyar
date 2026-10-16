import { $, clampInt } from '../shared/dom.ts';
import { LANGS, createI18n, detectLang, isLang } from '../shared/i18n.ts';
import type { Lang } from '../shared/i18n.ts';
import { loadJson, readLangPref, saveJson } from '../shared/storage.ts';
import { savePdf } from '../shared/downloads.ts';
import { PH, PW, buildPuzzlePdf, opsToSvg } from './core.ts';
import type { Op, PuzzleBase } from './core.ts';
import { WS_THEMES } from './words.ts';
import { drawWordSearch, genWordSearch } from './wordsearch.ts';
import type { WordSearch } from './wordsearch.ts';
import { DOT_SHAPES, drawDots, genDots } from './dots.ts';
import type { Dots } from './dots.ts';
import { drawMath, genMath } from './math.ts';
import type { MathSheet } from './math.ts';
import { drawScramble, genScramble } from './scramble.ts';
import type { Scramble } from './scramble.ts';
import { drawSpot, genSpot } from './spot.ts';
import type { Spot } from './spot.ts';
import { TEXTS } from './texts.ts';

const MODE = 'puzzles';
const MAX_COUNT = 12;
const KEY = 'maze-factory-puzzles';
const i18n = createI18n(TEXTS);
const t = i18n.t;

/* ---------- puzzle types ---------- */
type Puzzle =
  | { type: 'ws'; p: WordSearch }
  | { type: 'dots'; p: Dots }
  | { type: 'pyr' | 'magic'; p: MathSheet }
  | { type: 'scr'; p: Scramble }
  | { type: 'spot'; p: Spot };
type Item = PuzzleBase & Puzzle & { seed: number };
type PuzzleType = Puzzle['type'];

const TYPE_IDS: PuzzleType[] = ['ws', 'dots', 'pyr', 'magic', 'scr', 'spot'];
const TYPE_FILE: Record<PuzzleType, string> = {
  ws: 'word-search', dots: 'dot-to-dot', pyr: 'number-pyramid', magic: 'magic-square', scr: 'word-scramble', spot: 'spot-the-difference'
};

/* ---------- state and persistence ---------- */
interface State {
  type: PuzzleType; band: number; theme: string; shape: string; step: number;
  count: number; solutions: boolean; lang: Lang | null;
}
const ST: State = { type: 'ws', band: 1, theme: 'mix', shape: 'any', step: 0, count: 1, solutions: true, lang: null };
let seed = 0, puz: Puzzle, showSol = false;
function persist(): void { saveJson(KEY, ST, ST.lang); }
function randomSeed(): number { return 1 + Math.floor(Math.random() * 9999); }

/* ---------- generating and drawing the puzzle ---------- */
function makePuzzle(type: PuzzleType, sd: number): Puzzle {
  const lang = i18n.lang;
  switch(type){
    case 'ws': return { type, p: genWordSearch(sd, ST.band, { theme: ST.theme }, lang) };
    case 'dots': return { type, p: genDots(sd, ST.band, { shape: ST.shape, step: ST.step }) };
    case 'scr': return { type, p: genScramble(sd, ST.band, { theme: ST.theme }, lang) };
    case 'spot': return { type, p: genSpot(sd, ST.band) };
    case 'pyr': case 'magic': return { type, p: genMath(sd, ST.band, type) };
  }
}
function drawItem(it: Item, solution: boolean): Op[] {
  switch(it.type){
    case 'ws': return drawWordSearch(it.p, solution);
    case 'dots': return drawDots(it.p, solution);
    case 'scr': return drawScramble(it.p, solution);
    case 'spot': return drawSpot(it.p, solution);
    case 'pyr': case 'magic': return drawMath(it.p, solution, i18n.lang);
  }
}
function instruction(pz: Puzzle): string {
  switch(pz.type){
    case 'ws': return i18n.list('wsInstr')[ST.band];
    case 'dots': return t('dotsInstr') + (pz.p.step > 1 ? ' ' + t('dotsStep', pz.p.step) : '');
    case 'scr': return t('scrInstr') + (pz.p.hint ? t('scrHint') : '');
    case 'spot': return t('spotInstr', pz.p.nd);
    case 'pyr': return t('pyrInstr');
    case 'magic': return t('magInstr');
  }
}
function itemFor(pz: Puzzle, sd: number): Item {
  const tn = i18n.list('types')[TYPE_IDS.indexOf(pz.type)], band = i18n.list('bands')[ST.band];
  const extra = pz.type === 'dots' ? pz.p.name[i18n.lang] : '';
  return Object.assign({}, pz, {
    seed: sd,
    caption: tn + ' · ' + band + ' · ' + t('numLabel') + ': ' + sd,
    instr: instruction(pz),
    solCaption: t('solCap', tn + ' #' + sd, extra || band)
  });
}
function current(): Item { return itemFor(puz, seed); }
function renderSheet(): void {
  const it = current();
  $('sheet').innerHTML = '<svg viewBox="0 0 ' + PW + ' ' + PH + '" xmlns="http://www.w3.org/2000/svg"><rect width="' + PW + '" height="' + PH + '" fill="#fff"/>' +
    opsToSvg(drawItem(it, showSol)) + '</svg>';
  $('cap').textContent = it.caption;
}
function build(announceIt: boolean): void {
  puz = makePuzzle(ST.type, seed);
  showSol = false;
  $<HTMLInputElement>('seedIn').value = String(seed); $('seedMsg').textContent = '';
  updateChips(); updateSolBtn(); renderSheet(); updateExportUI();
  if(announceIt) $('live').textContent = t('liveNew', i18n.list('types')[TYPE_IDS.indexOf(ST.type)], seed);
}
function updateSolBtn(): void {
  $('solBtn').setAttribute('aria-pressed', String(showSol));
  $('solLbl').textContent = showSol ? t('solHide') : t('solShow');
}

/* ---------- user interface ---------- */
function chip(host: HTMLElement, html: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.innerHTML = html;
  b.addEventListener('click', onClick); host.appendChild(b); return b;
}
const nm = (b: HTMLElement): HTMLElement => b.querySelector('.nm') as HTMLElement;
const typeBtns = TYPE_IDS.map(id => chip($('types'), '<span class="nm"></span>', () => { ST.type = id; persist(); build(true); }));
const bandBtns = [0, 1, 2].map(i => chip($('bands'), '<span class="nm"></span><small></small>', () => { ST.band = i; persist(); build(true); }));
const themeIds = ['mix'].concat(WS_THEMES.map(x => x.id));
const themeBtns = themeIds.map(id => chip($('themes'), '<span class="nm"></span>', () => { ST.theme = id; persist(); build(true); }));
const shapeIds = ['any'].concat(DOT_SHAPES.map(x => x.id));
const shapeBtns = shapeIds.map(id => chip($('dshapes'), '<span class="nm"></span>', () => { ST.shape = id; persist(); build(true); }));
const stepVals = [0, 1, 2, 5, 10];
const stepBtns = stepVals.map(v => chip($('steps'), '<span class="nm"></span>', () => { ST.step = v; persist(); build(true); }));

function updateChips(): void {
  typeBtns.forEach((b, i) => { nm(b).textContent = i18n.list('types')[i]; b.setAttribute('aria-pressed', String(TYPE_IDS[i] === ST.type)); });
  bandBtns.forEach((b, i) => {
    nm(b).textContent = i18n.list('bands')[i]; (b.querySelector('small') as HTMLElement).textContent = i18n.list('grades')[i];
    b.setAttribute('aria-pressed', String(i === ST.band));
  });
  themeBtns.forEach((b, i) => {
    nm(b).textContent = themeIds[i] === 'mix' ? t('themeMix') : WS_THEMES[i - 1].name[i18n.lang];
    b.setAttribute('aria-pressed', String(themeIds[i] === ST.theme));
  });
  shapeBtns.forEach((b, i) => {
    nm(b).textContent = shapeIds[i] === 'any' ? t('shapeAny') : DOT_SHAPES[i - 1].name[i18n.lang];
    b.setAttribute('aria-pressed', String(shapeIds[i] === ST.shape));
  });
  stepBtns.forEach((b, i) => {
    nm(b).textContent = stepVals[i] === 0 ? t('stepAuto') : t('stepN', stepVals[i]);
    b.setAttribute('aria-pressed', String(stepVals[i] === ST.step));
  });
  $('optWs').hidden = ST.type !== 'ws' && ST.type !== 'scr'; $('optDots').hidden = ST.type !== 'dots';
}

$('newBtn').addEventListener('click', () => { seed = randomSeed(); build(true); });
$('solBtn').addEventListener('click', () => { showSol = !showSol; updateSolBtn(); renderSheet(); });
$('seedForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = parseInt($<HTMLInputElement>('seedIn').value, 10);
  if(!(v >= 1 && v <= 9999)){ $('seedMsg').textContent = t('seedErr'); return; }
  seed = v; build(true);
});

/* ---------- PDF ---------- */
const pdfMsgState: { key: string | null; err: boolean } = { key: null, err: false };
function pdfMessage(key: string | null, isErr: boolean): void {
  pdfMsgState.key = key; pdfMsgState.err = isErr;
  const m = $('pdfMsg'); m.textContent = key ? t(key) : ''; m.classList.toggle('err', isErr);
}
function pdfPages(): number { return ST.count + (ST.solutions ? Math.ceil(ST.count / 4) : 0); }
function updateExportUI(): void {
  $('cntOut').textContent = String(ST.count);
  $<HTMLButtonElement>('cntMinus').disabled = ST.count <= 1; $<HTMLButtonElement>('cntPlus').disabled = ST.count >= MAX_COUNT;
  $<HTMLInputElement>('optSol').checked = ST.solutions;
  $('pdfSum').textContent = t('pdfSum', ST.count, pdfPages());
}
$('cntMinus').addEventListener('click', () => { ST.count = Math.max(1, ST.count - 1); persist(); updateExportUI(); });
$('cntPlus').addEventListener('click', () => { ST.count = Math.min(MAX_COUNT, ST.count + 1); persist(); updateExportUI(); });
$('optSol').addEventListener('change', e => { ST.solutions = (e.target as HTMLInputElement).checked; persist(); updateExportUI(); });

$('pdfBtn').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('pdfBtn');
  if(!window.jspdf){ pdfMessage('pdfNoLib', true); return; }
  btn.disabled = true; pdfMessage('pdfMaking', false);
  await new Promise(r => setTimeout(r, 40));
  try {
    const items = [current()], used = new Set([seed]);
    while(items.length < ST.count){
      const sd = randomSeed();
      if(used.has(sd)) continue;
      used.add(sd); items.push(itemFor(makePuzzle(ST.type, sd), sd));
    }
    const buf = buildPuzzlePdf(window.jspdf.jsPDF, { reg: __FONT_REG__, bold: __FONT_BOLD__ }, items, {
      solutions: ST.solutions, draw: drawItem,
      tx: { brand: t('brand'), title: t('pdfDocTitle'), name: t('pdfName'), footer: t('pdfFooter'), solSub: t('solSub') }
    });
    savePdf(buf, 'puzzle-' + TYPE_FILE[ST.type] + '-' + seed + '-' + i18n.lang + '.pdf');
    pdfMessage('pdfSaved', false);
  } catch(err){
    pdfMessage('pdfFail', true);
  } finally { btn.disabled = false; updateExportUI(); }
});

/* ---------- language ---------- */
const langSel = $<HTMLSelectElement>('langSel');
LANGS.forEach(l => { const o = document.createElement('option'); o.value = l[0]; o.textContent = l[1]; langSel.appendChild(o); });
function applyI18n(): void {
  const lang = i18n.lang;
  document.documentElement.lang = lang;
  document.querySelectorAll<HTMLElement>('[data-t]').forEach(el => { el.textContent = t(el.dataset.t as string); });
  document.querySelectorAll<HTMLElement>('[data-t-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.tAria as string)); });
  document.querySelectorAll<HTMLElement>('.navlink').forEach(a => { if(a.dataset.nav === MODE) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.title = t('brand') + ' · ' + t('navPuzzles');
  langSel.value = lang; $('langCode').textContent = lang.toUpperCase();
  $('cntMinus').setAttribute('aria-label', '−'); $('cntPlus').setAttribute('aria-label', '+');
  updateChips(); updateSolBtn(); updateExportUI();
  if(pdfMsgState.key) pdfMessage(pdfMsgState.key, pdfMsgState.err);
}
langSel.addEventListener('change', () => {
  const v = langSel.value;
  i18n.set(isLang(v) ? v : 'en');
  ST.lang = i18n.lang; persist(); applyI18n();
  if(ST.type === 'ws' || ST.type === 'scr') build(false); else renderSheet();
});

/* ---------- startup ---------- */
const saved = loadJson(KEY);
ST.type = TYPE_IDS.find(id => id === saved.type) ?? 'ws';
ST.band = clampInt(saved.band, 0, 2, 1);
ST.theme = themeIds.indexOf(saved.theme as string) >= 0 ? saved.theme as string : 'mix';
ST.shape = shapeIds.indexOf(saved.shape as string) >= 0 ? saved.shape as string : 'any';
ST.step = stepVals.indexOf(saved.step as number) >= 0 ? saved.step as number : 0;
ST.count = clampInt(saved.count, 1, MAX_COUNT, 1);
ST.solutions = saved.solutions !== false;
ST.lang = readLangPref() || (isLang(saved.lang) ? saved.lang : null);
i18n.set(detectLang(ST.lang));
seed = randomSeed();
applyI18n();
build(false);
