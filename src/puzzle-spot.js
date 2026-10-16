//#region puzzle-spot
// Spot the difference: two almost identical pictures; find the differences.
const SPOT = [
  { nd: 3, kinds: ['remove', 'swap', 'size'] },
  { nd: 5, kinds: ['remove', 'swap', 'size', 'add', 'variant'] },
  { nd: 7, kinds: ['remove', 'swap', 'size', 'add', 'variant', 'variant', 'variant'] }
];
const ICONS = ['house', 'tree', 'sun', 'flower', 'star', 'fish', 'balloon', 'heart'];
function iconOps(type, v, cx, cy, s){
  const ops = [], W = 2.2;
  const X = u => cx + u * s, Y = u => cy + u * s;
  const L = (a, b, c, d) => ops.push({ k: 'line', x1: X(a), y1: Y(b), x2: X(c), y2: Y(d), w: W });
  const Pl = (pts, close) => ops.push({ k: 'poly', pts: pts.map(q => [X(q[0]), Y(q[1])]), w: W, close: !!close });
  const Ci = (x, y, r, fill) => ops.push({ k: 'circle', x: X(x), y: Y(y), r: r * s, w: fill != null ? 0 : W, fill: fill });
  const ell = (x, y, rx, ry, n) => { const a = []; for(let i = 0; i < n; i++){ const t = 2 * Math.PI * i / n; a.push([x + rx * Math.cos(t), y + ry * Math.sin(t)]); } return a; };
  if(type === 'house'){
    Pl([[-.35, -.05], [.35, -.05], [.35, .4], [-.35, .4]], true); Pl([[-.45, -.05], [0, -.45], [.45, -.05]], true);
    Pl([[-.08, .4], [-.08, .15], [.12, .15], [.12, .4]]); Pl([[-.3, .08], [-.18, .08], [-.18, .2], [-.3, .2]], true);
    if(v) Pl([[.18, -.2], [.18, -.42], [.3, -.42], [.3, -.12]]);
  } else if(type === 'tree'){
    Ci(0, -.15, .32); L(0, .17, 0, .45); L(-.12, .45, .12, .45);
    [[-.13, -.22], [.12, -.04], [.1, -.28]].slice(0, v ? 3 : 1).forEach(q => Ci(q[0], q[1], .055, 0));
  } else if(type === 'sun'){
    Ci(0, 0, .2); const n = v ? 12 : 8;
    for(let i = 0; i < n; i++){ const t = 2 * Math.PI * i / n; L(.29 * Math.cos(t), .29 * Math.sin(t), .45 * Math.cos(t), .45 * Math.sin(t)); }
  } else if(type === 'flower'){
    const n = v ? 6 : 4;
    for(let i = 0; i < n; i++){ const t = 2 * Math.PI * i / n; Ci(.17 * Math.cos(t), -.12 + .17 * Math.sin(t), .12); }
    Ci(0, -.12, .07, 0); L(0, .06, 0, .45); Pl([[0, .3], [.18, .2], [.1, .38]], true);
  } else if(type === 'star'){
    const n = v ? 6 : 5, pts = [];
    for(let i = 0; i < 2 * n; i++){ const t = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? .2 : .46; pts.push([r * Math.cos(t), r * Math.sin(t)]); }
    Pl(pts, true);
  } else if(type === 'fish'){
    Pl(ell(-.05, 0, .38, .22, 24), true); Pl([[.3, 0], [.5, -.2], [.5, .2]], true); Ci(-.24, -.05, .03, 0);
    if(v) L(.05, -.2, .05, .2);
  } else if(type === 'balloon'){
    Pl(ell(0, -.12, .27, .33, 24), true); Pl([[-.05, .23], [0, .17], [.05, .23]], true); Pl([[0, .24], [.06, .32], [-.06, .38], [0, .46]]);
    if(v) L(-.27, -.12, .27, -.12);
  } else if(type === 'heart'){
    const pts = [];
    for(let i = 0; i < 40; i++){ const t = 2 * Math.PI * i / 40; pts.push([.027 * 16 * Math.pow(Math.sin(t), 3), .03 - .027 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]); }
    Pl(pts, true);
    if(v) Ci(0, -.05, .08);
  }
  return ops;
}

const SP_PW = 495, SP_PH = 300, SP_X = 10, SP_Y = [4, 340];
function genSpot(seed, band){
  const B = SPOT[band], rnd = puzzleRng(seed, band, 'spot');
  const slots = [];
  for(let r = 0; r < 3; r++) for(let c = 0; c < 4; c++){
    slots.push({ x: SP_X + (c + .5) * SP_PW / 4 + (rnd() - .5) * 16, y: (r + .5) * SP_PH / 3 + (rnd() - .5) * 10, s: 60 + rnd() * 14,
      type: ICONS[Math.floor(rnd() * ICONS.length)], v: rnd() < .5 ? 0 : 1, on: true });
  }
  const order = shuffle(slots.map((_, i) => i), rnd);
  const empties = order.slice(0, 2), used = new Set(empties);
  empties.forEach(i => { slots[i].on = false; });
  const A = slots.map(s => Object.assign({}, s)), Bs = slots.map(s => Object.assign({}, s));
  const free = order.slice(2), diffs = [];
  const kinds = shuffle(B.kinds.slice(), rnd);
  while(kinds.length < B.nd) kinds.push('remove');
  kinds.slice(0, B.nd).forEach(k => {
    let i;
    if(k === 'add'){
      i = empties.find(e => !diffs.some(d => d.i === e));
      if(i === undefined){ k = 'remove'; }
    }
    if(k !== 'add'){ i = free.shift(); }
    const sB = Bs[i];
    if(k === 'add'){ sB.on = true; A[i].on = false; }
    else if(k === 'remove') sB.on = false;
    else if(k === 'swap'){ const o = ICONS.filter(t => t !== sB.type); sB.type = o[Math.floor(rnd() * o.length)]; sB.v = rnd() < .5 ? 0 : 1; }
    else if(k === 'size') sB.s = sB.s * .62;
    else if(k === 'variant') sB.v = 1 - sB.v;
    diffs.push({ i: i, kind: k });
  });
  return { A: A, B: Bs, diffs: diffs, nd: diffs.length, band: band };
}
function drawSpot(p, solution){
  const ops = [];
  [p.A, p.B].forEach((scene, k) => {
    const y0 = SP_Y[k];
    ops.push({ k: 'poly', pts: [[SP_X, y0], [SP_X + SP_PW, y0], [SP_X + SP_PW, y0 + SP_PH], [SP_X, y0 + SP_PH]], w: 2, close: true });
    scene.forEach(s => { if(s.on) iconOps(s.type, s.v, s.x, y0 + s.y, s.s).forEach(o => ops.push(o)); });
    if(solution) p.diffs.forEach(d => {
      const s = p.A[d.i], q = p.B[d.i];
      ops.push({ k: 'circle', x: (q.on ? q : s).x, y: y0 + (q.on ? q : s).y, r: 44, w: 3, g: 60 });
    });
  });
  return ops;
}
//#endregion
