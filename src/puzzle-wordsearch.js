//#region puzzle-wordsearch
const WS_ALPHA = {
  en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  hu: 'AÁBCDEÉFGHIÍJKLMNOÓÖŐPQRSTUÚÜŰVWXYZ'
};

// st: { theme }, lang: 'hu' | 'en'
function genWordSearch(seed, band, st, lang){
  let p = null;
  for(let a = 0; a < 25; a++){ p = genWordSearchTry(seed, band, st, lang, a); if(p.ok) break; }
  return p;
}
function genWordSearchTry(seed, band, st, lang, attempt){
  const B = BANDS[band].ws, n = B.n, dirs = B.dirs;
  const rnd = puzzleRng(seed, band, 'ws' + st.theme + lang + (attempt ? '#' + attempt : ''));
  // choose the words
  let pool = themeWords(st.theme, lang).filter(w => w.length >= B.minLen && w.length <= Math.min(B.maxLen, n));
  if(pool.length < B.count){
    const extra = themeWords('mix', lang).filter(w => w.length >= B.minLen && w.length <= Math.min(B.maxLen, n) && pool.indexOf(w) < 0);
    pool = pool.concat(shuffle(extra, rnd));
  }
  shuffle(pool, rnd);
  const rev = s => s.split('').reverse().join('');
  const chosen = [];
  for(const w of pool){
    if(chosen.length >= B.count) break;
    // no word may be part of another (forwards or backwards)
    if(chosen.some(c => c.indexOf(w) >= 0 || w.indexOf(c) >= 0 || c.indexOf(rev(w)) >= 0 || w.indexOf(rev(c)) >= 0)) continue;
    chosen.push(w);
  }
  chosen.sort((a, b) => b.length - a.length);

  // placement
  let grid, placed;
  for(let round = 0; round < 80; round++){
    grid = new Array(n * n).fill(''); placed = [];
    let ok = true;
    for(const w of chosen){
      let done = false;
      for(let t = 0; t < 300 && !done; t++){
        const d = dirs[Math.floor(rnd() * dirs.length)];
        const x0 = Math.floor(rnd() * n), y0 = Math.floor(rnd() * n);
        const xe = x0 + d[0] * (w.length - 1), ye = y0 + d[1] * (w.length - 1);
        if(xe < 0 || ye < 0 || xe >= n || ye >= n) continue;
        let fits = true;
        for(let i = 0; i < w.length; i++){
          const c = grid[(y0 + d[1] * i) * n + x0 + d[0] * i];
          if(c !== '' && c !== w[i]){ fits = false; break; }
        }
        if(!fits) continue;
        for(let i = 0; i < w.length; i++) grid[(y0 + d[1] * i) * n + x0 + d[0] * i] = w[i];
        placed.push({ w: w, x: x0, y: y0, dx: d[0], dy: d[1] });
        done = true;
      }
      if(!done){ ok = false; break; }
    }
    if(ok) break;
    if(round === 79) placed = placed.slice();
  }
  const locked = grid.map(c => c !== '');

  // filler letters follow the language's letter frequency so accented letters give nothing away
  const bag = [];
  const freq = {};
  themeWords('mix', lang).forEach(w => w.split('').forEach(ch => { freq[ch] = (freq[ch] || 0) + 1; }));
  WS_ALPHA[lang].split('').forEach(ch => { const k = Math.max(1, Math.round((freq[ch] || 0) / 4)); for(let i = 0; i < k; i++) bag.push(ch); });
  const fill = () => bag[Math.floor(rnd() * bag.length)];
  for(let i = 0; i < n * n; i++) if(!locked[i]) grid[i] = fill();

  // every word must occur exactly once (only in the allowed directions)
  const countOcc = w => {
    let cnt = 0;
    for(let y = 0; y < n; y++) for(let x = 0; x < n; x++) for(const d of dirs){
      const xe = x + d[0] * (w.length - 1), ye = y + d[1] * (w.length - 1);
      if(xe < 0 || ye < 0 || xe >= n || ye >= n) continue;
      let m = true;
      for(let i = 0; i < w.length; i++) if(grid[(y + d[1] * i) * n + x + d[0] * i] !== w[i]){ m = false; break; }
      if(m) cnt++;
    }
    return cnt;
  };
  let ok = false;
  for(let tries = 0; tries < 400; tries++){
    if(placed.every(p => countOcc(p.w) === 1)){ ok = true; break; }
    for(let i = 0; i < n * n; i++) if(!locked[i]) grid[i] = fill();
  }
  ok = ok && placed.length >= Math.min(B.count, 5);
  const list = placed.map(p => p.w).sort((a, b) => a.localeCompare(b, lang));
  return { ok: ok, n: n, grid: grid, placed: placed, list: list, band: band, lang: lang, theme: st.theme, dirs: dirs.length };
}

// Drawing: a large grid with the word list and tick boxes below it.
function drawWordSearch(p, solution){
  const ops = [], n = p.n, gs = Math.min(450, PW - 20), cell = gs / n, x0 = (PW - gs) / 2, y0 = 6;
  if(solution){
    for(const w of p.placed){
      ops.push({ k: 'line', x1: x0 + (w.x + 0.5) * cell, y1: y0 + (w.y + 0.5) * cell,
        x2: x0 + (w.x + w.dx * (w.w.length - 1) + 0.5) * cell, y2: y0 + (w.y + w.dy * (w.w.length - 1) + 0.5) * cell,
        w: cell * 0.78, g: 205 });
    }
  }
  for(let i = 0; i <= n; i++){
    ops.push({ k: 'line', x1: x0, y1: y0 + i * cell, x2: x0 + gs, y2: y0 + i * cell, w: i === 0 || i === n ? 1.8 : 0.6, g: i === 0 || i === n ? 0 : 150 });
    ops.push({ k: 'line', x1: x0 + i * cell, y1: y0, x2: x0 + i * cell, y2: y0 + gs, w: i === 0 || i === n ? 1.8 : 0.6, g: i === 0 || i === n ? 0 : 150 });
  }
  const fs = Math.min(30, cell * 0.56);
  for(let y = 0; y < n; y++) for(let x = 0; x < n; x++){
    ops.push({ k: 'text', x: x0 + (x + 0.5) * cell, y: y0 + (y + 0.5) * cell + fs * 0.36, s: p.grid[y * n + x], size: fs, b: true, a: 'c' });
  }
  if(!solution){
    const cols = p.list.length > 8 ? 3 : 2, rows = Math.ceil(p.list.length / cols), colW = (PW - 40) / cols;
    const ly = y0 + gs + 38;
    p.list.forEach((w, i) => {
      const c = (i / rows) | 0, r = i % rows, x = 20 + c * colW, y = ly + r * 27;
      ops.push({ k: 'poly', pts: [[x, y - 11], [x + 11, y - 11], [x + 11, y], [x, y]], w: 1.2, close: true });
      ops.push({ k: 'text', x: x + 20, y: y, s: w, size: 15, b: true, a: 'l' });
    });
  }
  return ops;
}
//#endregion
