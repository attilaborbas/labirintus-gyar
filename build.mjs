// Builds the standalone pages (index.html, print.html, puzzles.html) from src/.
// Usage: node build.mjs   (or: npm run build)
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(dirname(fileURLToPath(import.meta.url)));
const read = f => readFileSync(f, 'utf8');
// Plain-text replacement (String.replace would interpret "$" sequences in the replacement).
const replaceAll = (s, a, b) => s.split(a).join(b);

const DESCRIPTION = 'Maze Factory: a kid-friendly maze generator and printable puzzles, in Hungarian and English.';
const fonts = {
  __FONT_REG__: JSON.stringify(read('src/fonts/f_reg.b64').trim()),
  __FONT_BOLD__: JSON.stringify(read('src/fonts/f_bold.b64').trim())
};

async function bundle(entry) {
  const result = await build({
    entryPoints: [entry], bundle: true, format: 'iife', target: 'es2020',
    write: false, define: fonts, legalComments: 'none', charset: 'utf8'
  });
  return result.outputFiles[0].text.replaceAll('</script', '<\\/script');
}

async function page({ shell, css, entry, out, title, mode }) {
  let html = read(shell);
  html = replaceAll(html, '__DESCRIPTION__', DESCRIPTION);
  html = replaceAll(html, '/*__CSS__*/', css.map(read).join('\n'));
  if (title) html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`);
  if (mode) html = html.replace('<body class="mode-play">', () => `<body class="mode-${mode}">`);
  html = replaceAll(html, '/*__BUNDLE__*/', await bundle(entry));
  writeFileSync(out, html);
}

const mazeCss = ['src/styles/shared.css'];
await page({ shell: 'src/pages/maze.html', css: mazeCss, entry: 'src/maze/main.ts', out: 'index.html' });
await page({ shell: 'src/pages/maze.html', css: mazeCss, entry: 'src/maze/main.ts', out: 'print.html', title: 'Maze Factory · Print', mode: 'print' });
await page({ shell: 'src/pages/puzzles.html', css: ['src/styles/shared.css', 'src/styles/puzzles.css'], entry: 'src/puzzles/main.ts', out: 'puzzles.html' });
console.log('built');
