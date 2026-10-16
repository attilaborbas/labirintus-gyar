// Builds the standalone pages (index.html, print.html, puzzles.html) from src/.
// Usage: node build.js
const fs = require('fs');
const path = require('path');
process.chdir(__dirname);
const SRC = 'src/';
const read = f => fs.readFileSync(f, 'utf8');
// Plain-text replacement (String.replace would interpret "$" sequences in the replacement).
const replaceAll = (s, a, b) => s.split(a).join(b);
const replaceFirst = (s, a, b) => { const i = s.indexOf(a); return i < 0 ? s : s.slice(0, i) + b + s.slice(i + a.length); };

const fontReg = read(SRC + 'fonts/f_reg.b64').trim();
const fontBold = read(SRC + 'fonts/f_bold.b64').trim();
const DESC = 'Maze Factory: a kid-friendly maze generator and printable puzzles, in Hungarian and English.';
const head = desc => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="${desc}">
<style>:root{color-scheme:light}html,body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>
`;
// Standalone pages save PDFs through a Blob download instead of the claude.ai "downloads" capability.
const BLOB = `function blobSaver(){
  return { save: async function(r){
    const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = r.filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { status: 'saved' };
  } };
}
let dlPromise = null;`;
const useBlobSaver = t => replaceFirst(
  replaceAll(t, 'Promise.resolve(null))\n      .catch', 'Promise.resolve(blobSaver()))\n      .catch'),
  'let dlPromise = null;', BLOB);

function standalone(t, mode, title) {
  t = useBlobSaver(t);
  t = t.replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`);
  const i = t.indexOf('</style>\n\n<div class="app">');
  t = t.slice(0, i) + `</style>\n</head>\n<body class="mode-${mode}">` + t.slice(i + 8);
  return head(DESC) + t + '\n</body>\n</html>\n';
}
const withFonts = t => replaceAll(replaceAll(t, '__FONT_REG__', fontReg), '__FONT_BOLD__', fontBold);

// maze pages
const maze = read(SRC + 'maze.template.html');
const mazeFull = withFonts(replaceAll(maze, '//__PDFREGION__', read(SRC + 'pdf-maze.js').trimEnd()));
fs.writeFileSync('index.html', standalone(mazeFull, 'play', 'Maze Factory'));
fs.writeFileSync('print.html', standalone(mazeFull, 'print', 'Maze Factory · Print'));

// puzzles page
let puz = read(SRC + 'puzzles.template.html');
const css = maze.slice(maze.indexOf('<style>') + 7, maze.indexOf('</style>'));
puz = replaceAll(puz, '/*__SHARED_CSS__*/', css);
puz = withFonts(puz);
for (const k of ['puzzle-core.js', 'puzzle-words.js', 'puzzle-wordsearch.js', 'puzzle-dots.js', 'puzzle-math.js', 'puzzle-scramble.js', 'puzzle-spot.js']) {
  puz = replaceAll(puz, `//__${k}__`, read(SRC + k).trimEnd());
}
puz = useBlobSaver(puz);
const i = puz.indexOf('</style>\n\n<div class="app');
puz = head(DESC) + puz.slice(0, i) + '</style>\n</head>\n<body class="mode-puzzles">' + puz.slice(i + 8) + '\n</body>\n</html>\n';
fs.writeFileSync('puzzles.html', puz);
console.log('built');
