// Typed getElementById that fails loudly when the markup and the code disagree.
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if(!el) throw new Error('Missing element #' + id);
  return el as T;
}
export function clampInt(v: unknown, lo: number, hi: number, d: number): number {
  const n = parseInt(String(v), 10);
  return (n >= lo && n <= hi) ? n : d;
}
