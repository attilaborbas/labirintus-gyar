import { DX, DY, bfs, generate, makeMask, maskRows } from './core.ts';
import type { Shape } from './core.ts';

const PDF_W = 595.28, PDF_H = 841.89;

export interface PdfLevel { name: string; n: number; braid: number; shape?: Shape; custom?: boolean }
export interface PdfBatch extends PdfLevel { seeds: number[] }
export interface PdfFonts { reg: string; bold: string }
export interface PdfMazeStrings {
  brand: string; title: string; name: string; instr: string; solSub: string; footer: string; start: string; goal: string;
  caption: (level: string, n: number, seed: number) => string;
}
export interface PdfOptions { per: number; solutions: boolean; tx: PdfMazeStrings }

interface PdfMaze {
  mask: Uint8Array | null; level: string; n: number; seed: number; custom: boolean; pct: number;
  walls: Uint8Array; start: number; goal: number; sol: number[] | null;
}

function pdfMaze(level: PdfLevel, seed: number): PdfMaze {
  const shape = level.shape || 0, mask = makeMask(shape, level.n), m = generate(level.n, seed, level.braid, mask, shape);
  return { mask: mask, level: level.name, n: level.n, seed: seed, custom: !!level.custom, pct: Math.round(level.braid * 100), walls: m.walls, start: m.start, goal: m.goal,
           sol: bfs(m.walls, level.n, m.start, m.goal) };
}

// The outer wall of the START and GOAL cells stays open so there is an entrance and an exit.
// Which side of the START / GOAL cell to open: the first free side in the order up, down, right, left.
function gateDir(m: PdfMaze, i: number): number {
  const n = m.n, cx = i % n, cy = (i / n) | 0;
  if(m.mask){
    const rr = maskRows(m.mask, n);
    if(cy === rr[0]) return 0;
    if(cy === rr[1]) return 2;
  } else {
    if(cy === 0) return 0;
    if(cy === n - 1) return 2;
  }
  for(const d of [0, 2, 1, 3]){
    const nx = cx + DX[d], ny = cy + DY[d];
    if(nx < 0 || ny < 0 || nx >= n || ny >= n || (m.mask && !m.mask[ny * n + nx])) return d;
  }
  return 0;
}
function pdfDrawMaze(doc: PdfDoc, m: PdfMaze, x: number, y: number, size: number, solution: boolean): number {
  const n = m.n, cs = size / n, w = m.walls;
  const lw = Math.max(1.3, Math.min(4.5, cs * 0.14));
  doc.setLineCap('round'); doc.setLineJoin('round');
  if(solution && m.sol){
    doc.setDrawColor(150); doc.setLineWidth(Math.max(1.6, cs * 0.3));
    for(let i = 0; i < m.sol.length - 1; i++){
      const a = m.sol[i], b = m.sol[i + 1];
      doc.line(x + (a % n + 0.5) * cs, y + (((a / n) | 0) + 0.5) * cs,
               x + (b % n + 0.5) * cs, y + (((b / n) | 0) + 0.5) * cs);
    }
  }
  doc.setDrawColor(0); doc.setLineWidth(lw);
  const gs = gateDir(m, m.start), gg = gateDir(m, m.goal), mk = m.mask, inM = (i: number) => !mk || mk[i] === 1;
  const open = (i: number, d: number) => (i === m.start && d === gs) || (i === m.goal && d === gg);
  for(let cy = 0; cy < n; cy++) for(let cx = 0; cx < n; cx++){
    const i = cy * n + cx, k = w[i], x0 = x + cx * cs, y0 = y + cy * cs;
    if(!inM(i)) continue;
    if((k & 1) && (cy === 0 || !inM(i - n)) && !open(i, 0)) doc.line(x0, y0, x0 + cs, y0);
    if((k & 2) && !open(i, 1)) doc.line(x0 + cs, y0, x0 + cs, y0 + cs);
    if((k & 4) && !open(i, 2)) doc.line(x0, y0 + cs, x0 + cs, y0 + cs);
    if((k & 8) && (cx === 0 || !inM(i - 1)) && !open(i, 3)) doc.line(x0, y0, x0, y0 + cs);
  }
  return lw;
}

function pdfGateLabels(doc: PdfDoc, m: PdfMaze, x: number, y: number, size: number, lw: number, tx: PdfMazeStrings): void {
  const n = m.n, cs = size / n, fs = Math.max(8, Math.min(14, cs * 0.5));
  doc.setFont('DejaVu', 'bold'); doc.setFontSize(fs);
  const gates: [number, string][] = [[m.start, tx.start], [m.goal, tx.goal]];
  gates.forEach(p => {
    const d = gateDir(m, p[0]), cx = x + (p[0] % n + 0.5) * cs, cyy = y + (((p[0] / n) | 0) + 0.5) * cs;
    if(d === 0) doc.text(p[1], cx, cyy - cs / 2 - lw - 3, { align: 'center' });
    else if(d === 2) doc.text(p[1], cx, cyy + cs / 2 + lw + fs, { align: 'center' });
    else if(d === 1) doc.text(p[1], cx + cs / 2 + lw + 3, cyy + fs * 0.35, { align: 'left' });
    else doc.text(p[1], cx - cs / 2 - lw - 3, cyy + fs * 0.35, { align: 'right' });
  });
}

export function buildPdf(jsPDF: PdfCtor, fonts: PdfFonts, batches: PdfBatch[], opts: PdfOptions): ArrayBuffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  doc.addFileToVFS('DejaVuSans.ttf', fonts.reg); doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold); doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  const tx = opts.tx;
  doc.setProperties({ title: tx.title, author: tx.brand });
  const AX = 40, AY = 100, AW = PDF_W - 80, AH = PDF_H - 140;
  let first = true;

  function newPage(sub: string): void {
    if(!first) doc.addPage();
    first = false;
    doc.setTextColor(0);
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(22); doc.text(tx.brand, AX, 58);
    doc.setFont('DejaVu', 'normal'); doc.setFontSize(12); doc.text(tx.name + ': ' + '______________', PDF_W - AX, 52, { align: 'right' });
    doc.setFontSize(11); doc.text(sub, AX, 82);
    doc.setFontSize(8.5); doc.setTextColor(110);
    doc.text(tx.footer, PDF_W / 2, PDF_H - 22, { align: 'center' });
    doc.setTextColor(0);
  }
  function place(m: PdfMaze, col: number, row: number, cols: number, rows: number, solution: boolean): void {
    const cw = AW / cols, ch = AH / rows;
    const size = Math.min(cw - 24, ch - 64);
    const x = AX + col * cw + (cw - size) / 2, top = AY + row * ch;
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(12); doc.setTextColor(0);
    doc.text(tx.caption(m.custom ? m.level + ' ' + m.pct + '%' : m.level, m.n, m.seed), x, top + 14);
    const y = top + 42;
    const lw = pdfDrawMaze(doc, m, x, y, size, solution);
    if(!solution) pdfGateLabels(doc, m, x, y, size, lw, tx);
  }

  const grids: Record<number, [number, number]> = { 1: [1, 1], 2: [1, 2], 4: [2, 2] };
  const g = grids[opts.per] || grids[1], cols = g[0], rows = g[1], per = cols * rows;
  const all: PdfMaze[] = [];
  batches.forEach(b => {
    const list = b.seeds.map(s => pdfMaze(b, s));
    list.forEach(m => all.push(m));
    for(let i = 0; i < list.length; i += per){
      newPage(tx.instr);
      list.slice(i, i + per).forEach((m, k) => place(m, k % cols, (k / cols) | 0, cols, rows, false));
    }
  });
  if(opts.solutions){
    for(let i = 0; i < all.length; i += 6){
      newPage(tx.solSub);
      all.slice(i, i + 6).forEach((m, k) => place(m, k % 2, (k / 2) | 0, 2, 3, true));
    }
  }
  return doc.output('arraybuffer');
}
