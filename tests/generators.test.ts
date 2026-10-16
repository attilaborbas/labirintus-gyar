import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bfs, generate, gridSize, makeMask, maskRows } from '../src/maze/core.ts';
import type { LevelDef } from '../src/maze/core.ts';
import { BANDS } from '../src/puzzles/core.ts';
import { WS_THEMES } from '../src/puzzles/words.ts';
import { drawWordSearch, genWordSearch } from '../src/puzzles/wordsearch.ts';
import { drawDots, genDots } from '../src/puzzles/dots.ts';
import { drawMath, genMath, magSolvable, pyrSolvable } from '../src/puzzles/math.ts';
import type { Magic, Pyramid } from '../src/puzzles/math.ts';
import { drawScramble, genScramble } from '../src/puzzles/scramble.ts';
import { SPOT_DIFFS, drawSpot, genSpot } from '../src/puzzles/spot.ts';
import type { Lang } from '../src/shared/i18n.ts';

const LANGS: Lang[] = ['hu', 'en'];
const THEMES = ['mix', ...WS_THEMES.map(t => t.id)];

test('mazes are solvable for every level and shape', () => {
  const levels: LevelDef[] = [{ n: 5, braid: 0.7 }, { n: 8, braid: 0.3 }, { n: 12, braid: 0.1 }, { n: 18, braid: 0 }, { n: 15, braid: 0.05, custom: true }];
  for(const L of levels) for(let shape = 0; shape < 5; shape++) for(let seed = 1000; seed < 1030; seed++){
    const n = gridSize(L, shape), mask = makeMask(shape, n), m = generate(n, seed, L.braid, mask, shape);
    const path = bfs(m.walls, n, m.start, m.goal);
    assert.ok(path, `no path: level ${L.n} shape ${shape} seed ${seed}`);
    if(mask){
      assert.ok(mask[m.start] && mask[m.goal]);
      const rows = maskRows(mask, n), sr = (m.start / n) | 0, gr = (m.goal / n) | 0;
      assert.deepEqual([sr, gr].sort(), [rows[0], rows[1]].sort());
    }
  }
});

test('word searches contain every word exactly once', () => {
  for(let seed = 1; seed <= 150; seed++) for(let band = 0; band < 3; band++) for(const lang of LANGS) for(const theme of THEMES){
    const p = genWordSearch(seed, band, { theme }, lang);
    assert.ok(p.ok, `word search failed: seed ${seed} band ${band} ${lang} ${theme}`);
    assert.ok(p.list.length >= Math.min(BANDS[band].ws.count, 5));
  }
});

test('dot-to-dot puzzles have the expected number of dots', () => {
  for(let seed = 1; seed <= 150; seed++) for(let band = 0; band < 3; band++) for(const shape of ['any', 'heart', 'star', 'house', 'fish', 'boat', 'rocket', 'tree']){
    const p = genDots(seed, band, { shape, step: 0 });
    assert.ok(p.n >= 10 && p.n <= BANDS[band].dots.n + 20, `dot count ${p.n}`);
    assert.ok(p.pos.every(q => isFinite(q[0]) && isFinite(q[1])));
    assert.equal(p.step, BANDS[band].dots.step);
  }
});

test('number pyramids and magic squares are valid and solvable', () => {
  const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  for(let seed = 1; seed <= 300; seed++) for(let band = 0; band < 3; band++){
    for(const it of genMath(seed, band, 'pyr').items as Pyramid[]){
      for(let i = 0; i < it.vals.length - 1; i++) for(let j = 0; j <= i; j++) assert.equal(it.vals[i][j], it.vals[i + 1][j] + it.vals[i + 1][j + 1]);
      assert.ok(pyrSolvable(it.known));
      assert.ok(it.known.some(r => r.some(x => !x)));
    }
    for(const it of genMath(seed, band, 'magic').items as Magic[]){
      for(const l of lines) assert.equal(l.reduce((a, i) => a + it.vals[i], 0), it.S);
      assert.equal(new Set(it.vals).size, 9);
      assert.ok(magSolvable(it.known));
    }
  }
});

test('word scrambles differ from the word but use the same letters', () => {
  for(let seed = 1; seed <= 150; seed++) for(let band = 0; band < 3; band++) for(const lang of LANGS) for(const theme of THEMES){
    const p = genScramble(seed, band, { theme }, lang);
    assert.equal(new Set(p.rows.map(r => r.w)).size, p.rows.length);
    for(const r of p.rows){
      assert.notEqual(r.s, r.w);
      assert.equal(r.s.split('').sort().join(''), r.w.split('').sort().join(''));
    }
  }
});

test('spot-the-difference pictures differ in exactly the stated places', () => {
  for(let seed = 1; seed <= 300; seed++) for(let band = 0; band < 3; band++){
    const p = genSpot(seed, band);
    assert.equal(p.nd, SPOT_DIFFS[band]);
    const real = p.A.filter((a, i) => { const q = p.B[i]; return a.on !== q.on || (a.on && (a.type !== q.type || a.v !== q.v || a.s !== q.s)); }).length;
    assert.equal(real, p.nd);
  }
});

// Golden snapshot: any change to a generator or a drawing routine changes this hash on purpose.
test('puzzle output matches the golden snapshot', () => {
  const h = createHash('sha256'), J = (x: unknown) => JSON.stringify(x);
  for(let s = 1; s <= 400; s++) for(let b = 0; b < 3; b++){
    for(const lang of LANGS){
      for(const theme of ['mix', 'animals', 'food']){
        const w = genWordSearch(s, b, { theme }, lang); h.update(J(w) + J(drawWordSearch(w, false)) + J(drawWordSearch(w, true)));
        const q = genScramble(s, b, { theme }, lang); h.update(J(q) + J(drawScramble(q, false)) + J(drawScramble(q, true)));
      }
      for(const k of ['pyr', 'magic'] as const){ const p = genMath(s, b, k); h.update(J(p) + J(drawMath(p, false, lang)) + J(drawMath(p, true, lang))); }
    }
    for(const sh of ['any', 'heart', 'fish', 'rocket']) for(const st of [0, 5]){ const d = genDots(s, b, { shape: sh, step: st }); h.update(J(d) + J(drawDots(d, false)) + J(drawDots(d, true))); }
    const sp = genSpot(s, b); h.update(J(sp) + J(drawSpot(sp, false)) + J(drawSpot(sp, true)));
  }
  assert.equal(h.digest('hex'), 'c00d0310ff740846e051e1acd55182b44a1dea4d7fba5612428d826a756ebf58');
});
