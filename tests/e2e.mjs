// Browser smoke test: loads the built pages, checks navigation and downloads a PDF for every puzzle type.
// Needs Playwright with a Chromium browser (not a regular dependency): npm i --no-save playwright && npx playwright install chromium
// jsPDF is normally loaded from cdnjs; set JSPDF_PATH to a local copy of jspdf.umd.min.js to run offline.
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jspdf = process.env.JSPDF_PATH ? readFileSync(process.env.JSPDF_PATH, 'utf8') : null;

const browser = await chromium.launch();
const errors = [];
async function open(file, viewport = { width: 430, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, locale: 'en-US' });
  await ctx.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (jspdf && url.includes('jspdf')) return route.fulfill({ body: jspdf, contentType: 'text/javascript' });
    if (!jspdf && url.includes('jspdf')) return route.continue();
    return route.abort();   // fonts etc.
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(file + ': ' + e.message));
  await page.goto(pathToFileURL(resolve(root, file)).href);
  await page.waitForTimeout(300);
  return page;
}
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
async function download(page, button) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click(button)]);
  return d.suggestedFilename();
}

for (const [file, current] of [['index.html', 'play'], ['print.html', 'print'], ['puzzles.html', 'puzzles']]) {
  const page = await open(file);
  assert.equal(await page.$eval('.navlink[aria-current="page"]', e => e.dataset.nav), current, file);
  assert.ok(await noOverflow(page), file + ' overflows horizontally');
  await page.close();
}

// maze: play a little, then save PDFs
let page = await open('index.html');
assert.match(await download(page, '#printOne'), /^maze-\d+-en\.pdf$/);
await page.keyboard.press('ArrowDown');
await page.close();
page = await open('print.html');
assert.equal(await download(page, '#pdfBtn'), 'maze-factory-en.pdf');
await page.close();

// puzzles: every type produces a PDF
page = await open('puzzles.html');
const names = ['word-search', 'dot-to-dot', 'number-pyramid', 'magic-square', 'word-scramble', 'spot-the-difference'];
for (let i = 0; i < names.length; i++) {
  await page.click(`#types .chip:nth-child(${i + 1})`);
  const file = await download(page, '#pdfBtn');
  assert.match(file, new RegExp(`^puzzle-${names[i]}-\\d+-en\\.pdf$`));
}
assert.ok(await noOverflow(page));
await page.close();

await browser.close();
assert.deepEqual(errors, []);
console.log('e2e ok');
