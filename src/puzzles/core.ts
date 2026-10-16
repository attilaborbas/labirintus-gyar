// Shared base of the puzzles: age bands, drawing operations (screen SVG and PDF).
import { mulberry32, shuffle } from '../shared/random.ts';
import type { Rng } from '../shared/random.ts';
export { shuffle };

export const PW = 515, PH = 660;   // logical drawing area of one puzzle (points, 1:1 on A4)

export type { Rng };

function strHash(s: string): number { let h = 7; for(let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
export function puzzleRng(seed: number, band: number, salt: string): Rng { return mulberry32(seed * 7919 + band * 104729 + strHash(salt)); }

export type Dir = [number, number];
// Age bands: 0 = ages 6–7, 1 = ages 8–9, 2 = ages 10–12.
const ALL_DIRS: Dir[] = [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, -1], [1, -1], [-1, 1]];
export interface BandSettings {
  ws: { n: number; count: number; minLen: number; maxLen: number; dirs: Dir[] };
  dots: { n: number; step: number };
}
export const BANDS: BandSettings[] = [
  { ws: { n: 7,  count: 6,  minLen: 3, maxLen: 5,  dirs: [[1, 0], [0, 1]] },         dots: { n: 24,  step: 1 } },
  { ws: { n: 10, count: 8,  minLen: 3, maxLen: 7,  dirs: [[1, 0], [0, 1], [1, 1]] }, dots: { n: 40,  step: 2 } },
  { ws: { n: 14, count: 12, minLen: 4, maxLen: 10, dirs: ALL_DIRS },                 dots: { n: 80,  step: 5 } }
];

// ---- drawing operations ----
// g = gray level 0 (black) … 255 (white); fill = gray level or undefined; y of text = baseline.
export interface LineOp { k: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; g?: number }
export interface CircleOp { k: 'circle'; x: number; y: number; r: number; w?: number; g?: number; fill?: number }
export interface PolyOp { k: 'poly'; pts: [number, number][]; w: number; g?: number; close?: boolean }
export interface TextOp { k: 'text'; x: number; y: number; s: string | number; size: number; b?: boolean; a?: 'l' | 'c' | 'r'; g?: number }
export type Op = LineOp | CircleOp | PolyOp | TextOp;

function gray(g?: number): string { const v = g == null ? 0 : g; return 'rgb(' + v + ',' + v + ',' + v + ')'; }
function esc(s: string | number): string { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
export function opsToSvg(ops: Op[]): string {
  let out = '';
  for(const o of ops){
    if(o.k === 'line'){
      out += '<line x1="' + o.x1.toFixed(2) + '" y1="' + o.y1.toFixed(2) + '" x2="' + o.x2.toFixed(2) + '" y2="' + o.y2.toFixed(2) +
        '" stroke="' + gray(o.g) + '" stroke-width="' + o.w + '" stroke-linecap="round"/>';
    } else if(o.k === 'circle'){
      out += '<circle cx="' + o.x.toFixed(2) + '" cy="' + o.y.toFixed(2) + '" r="' + o.r + '" fill="' + (o.fill == null ? 'none' : gray(o.fill)) +
        '" stroke="' + (o.w ? gray(o.g) : 'none') + '" stroke-width="' + (o.w || 0) + '"/>';
    } else if(o.k === 'poly'){
      out += '<' + (o.close ? 'polygon' : 'polyline') + ' points="' + o.pts.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ') +
        '" fill="none" stroke="' + gray(o.g) + '" stroke-width="' + o.w + '" stroke-linejoin="round" stroke-linecap="round"/>';
    } else {
      out += '<text x="' + o.x.toFixed(2) + '" y="' + o.y.toFixed(2) + '" font-size="' + o.size + '" font-weight="' + (o.b ? 800 : 600) +
        '" text-anchor="' + (o.a === 'c' ? 'middle' : o.a === 'r' ? 'end' : 'start') + '" fill="' + gray(o.g) + '">' + esc(o.s) + '</text>';
    }
  }
  return out;
}
export function opsToPdf(doc: PdfDoc, ops: Op[], ox: number, oy: number, sc: number): void {
  doc.setLineCap('round'); doc.setLineJoin('round');
  for(const o of ops){
    if(o.k === 'line'){
      doc.setDrawColor(o.g || 0); doc.setLineWidth(o.w * sc);
      doc.line(ox + o.x1 * sc, oy + o.y1 * sc, ox + o.x2 * sc, oy + o.y2 * sc);
    } else if(o.k === 'circle'){
      if(o.fill != null) doc.setFillColor(o.fill);
      doc.setDrawColor(o.g || 0); doc.setLineWidth((o.w || 0.1) * sc);
      doc.circle(ox + o.x * sc, oy + o.y * sc, o.r * sc, o.fill != null ? (o.w ? 'FD' : 'F') : 'S');
    } else if(o.k === 'poly'){
      doc.setDrawColor(o.g || 0); doc.setLineWidth(o.w * sc);
      const n = o.pts.length;
      for(let i = 0; i < n - (o.close ? 0 : 1); i++){
        const a = o.pts[i], b = o.pts[(i + 1) % n];
        doc.line(ox + a[0] * sc, oy + a[1] * sc, ox + b[0] * sc, oy + b[1] * sc);
      }
    } else {
      doc.setFont('DejaVu', o.b ? 'bold' : 'normal'); doc.setFontSize(o.size * sc); doc.setTextColor(o.g || 0);
      doc.text(String(o.s), ox + o.x * sc, oy + o.y * sc, { align: o.a === 'c' ? 'center' : o.a === 'r' ? 'right' : 'left' });
    }
  }
}

// ---- PDF pages ----
export interface PuzzleBase { caption: string; instr: string; solCaption: string }
export interface PdfStrings { brand: string; title: string; name: string; footer: string; solSub: string }
export interface PdfFonts { reg: string; bold: string }
export interface PdfOptions<I extends PuzzleBase> {
  solutions: boolean;
  tx: PdfStrings;
  draw: (item: I, solution: boolean) => Op[];
}
const PDF_W = 595.28, PDF_H = 841.89;
export function buildPuzzlePdf<I extends PuzzleBase>(jsPDF: PdfCtor, fonts: PdfFonts, items: I[], opts: PdfOptions<I>): ArrayBuffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  doc.addFileToVFS('DejaVuSans.ttf', fonts.reg); doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold); doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  const tx = opts.tx;
  doc.setProperties({ title: tx.title, author: tx.brand });
  const AX = 40, AY = 100;
  let first = true;
  function newPage(sub: string): void {
    if(!first) doc.addPage();
    first = false;
    doc.setTextColor(0);
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(22); doc.text(tx.brand, AX, 58);
    doc.setFont('DejaVu', 'normal'); doc.setFontSize(12); doc.text(tx.name + ': ' + '______________', PDF_W - AX, 52, { align: 'right' });
    const lines = doc.splitTextToSize(sub, PDF_W - 2 * AX);
    doc.setFontSize(11); doc.text(lines.slice(0, 2), AX, 80);
    doc.setFontSize(8.5); doc.setTextColor(110);
    doc.text(tx.footer, PDF_W / 2, PDF_H - 22, { align: 'center' });
    doc.setTextColor(0);
  }
  items.forEach(it => {
    newPage(it.instr);
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(12); doc.setTextColor(0);
    doc.text(it.caption, AX, AY + 8);
    opsToPdf(doc, opts.draw(it, false), AX, AY + 30, 1);
  });
  if(opts.solutions){
    const cw = (PDF_W - 2 * AX) / 2, ch = 350;
    for(let i = 0; i < items.length; i += 4){
      newPage(tx.solSub);
      items.slice(i, i + 4).forEach((it, k) => {
        const col = k % 2, row = (k / 2) | 0, x = AX + col * cw, y = AY + row * ch;
        doc.setFont('DejaVu', 'bold'); doc.setFontSize(10); doc.setTextColor(0);
        doc.text(it.solCaption, x, y + 8);
        const sc = Math.min((cw - 10) / PW, (ch - 30) / PH);
        opsToPdf(doc, opts.draw(it, true), x, y + 20, sc);
      });
    }
  }
  return doc.output('arraybuffer');
}
