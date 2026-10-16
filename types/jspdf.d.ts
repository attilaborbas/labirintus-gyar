// Minimal typings for the parts of jsPDF 2.5 (loaded from a CDN as window.jspdf) that this project uses.
interface PdfDoc {
  addFileToVFS(name: string, data: string): void;
  addFont(file: string, family: string, style: string): void;
  addPage(): void;
  circle(x: number, y: number, r: number, style?: string): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  output(type: 'arraybuffer'): ArrayBuffer;
  setDrawColor(gray: number): void;
  setFillColor(gray: number): void;
  setFont(family: string, style?: string): void;
  setFontSize(size: number): void;
  setLineCap(cap: string): void;
  setLineJoin(join: string): void;
  setLineWidth(width: number): void;
  setProperties(props: { title?: string; author?: string }): void;
  setTextColor(gray: number): void;
  splitTextToSize(text: string, width: number): string[];
  text(text: string | string[], x: number, y: number, opts?: { align?: 'left' | 'center' | 'right' }): void;
}
type PdfCtor = new (opts: { unit: string; format: string; compress?: boolean }) => PdfDoc;
interface Window { jspdf?: { jsPDF: PdfCtor } }
