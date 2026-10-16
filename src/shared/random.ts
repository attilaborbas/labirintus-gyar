// Seeded random numbers: the same seed always gives the same sequence.
export type Rng = () => number;

export function mulberry32(a: number): Rng {
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(arr: T[], rnd: Rng): T[] {
  for(let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(rnd() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}
