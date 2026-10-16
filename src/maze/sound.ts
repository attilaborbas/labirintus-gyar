// Small synthesized sound effects (no audio files). Everything is guarded: audio can be blocked.
let actx: AudioContext | null = null;
let enabled = true;
export function setSoundEnabled(on: boolean): void { enabled = on; }

export function tone(freq: number, dur: number, type?: OscillatorType, vol?: number, delay?: number): void {
  if(!enabled) return;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    actx = actx || new Ctor();
    const tm = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, tm);
    g.gain.setValueAtTime(0.0001, tm);
    g.gain.exponentialRampToValueAtTime(vol || 0.06, tm + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, tm + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(tm); o.stop(tm + dur + 0.03);
  } catch(e){ /* ignore */ }
}
export function jingle(): void { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.07, i * 0.12)); }
