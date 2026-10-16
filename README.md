# Maze Factory

Printable mazes and puzzles for kids, in Hungarian and English. A static site with no backend, hosted on GitHub Pages.

Live site: https://attilaborbas.github.io/labirintus-gyar/

## Pages

| Page | File | What it does |
| --- | --- | --- |
| Maze | `index.html` | Playable maze with custom difficulty and shapes; prints or saves the current maze as a PDF. |
| Print mazes | `print.html` | Batch-generates several mazes per PDF, with optional solutions. |
| Puzzles | `puzzles.html` | Word search, dot-to-dot, number pyramid, magic square, word scramble and spot the difference, with three age bands (6–7, 8–9, 10–12) and PDF export with solutions. |

Every page remembers its own settings in `localStorage`; only the language is shared. Puzzle numbers are seeds, so the same number and settings always give the same puzzle.

## Development

The code is TypeScript (strict). The three HTML files in the repo root are generated from `src/` by esbuild, so edit `src/` and rebuild:

```
npm install
npm run build       # writes index.html, print.html and puzzles.html
npm test            # type-check (tsc --strict) and generator tests
npm run test:e2e    # optional browser smoke test (needs Playwright, see the file header)
```

| Path | Purpose |
| --- | --- |
| `src/maze/` | Maze generation (`core.ts`), PDF drawing (`pdf.ts`), sound, texts and the game/print UI (`main.ts`) |
| `src/puzzles/` | One module per puzzle (`wordsearch`, `dots`, `math`, `scramble`, `spot`), shared drawing/PDF base (`core.ts`), word lists, texts and the page UI (`main.ts`) |
| `src/shared/` | Seeded random numbers, i18n, storage, DOM and download helpers |
| `src/pages/` | HTML shells (markup) for the maze pages and the puzzles page |
| `src/styles/` | CSS |
| `src/fonts/*.b64` | DejaVu Sans subsets (base64) embedded for the PDFs |
| `types/` | Typings for jsPDF (loaded from a CDN) and the build-time font constants |
| `tests/` | Generator tests (including a golden snapshot) and the browser smoke test |

Languages are Hungarian and English only (texts live in `texts.ts` next to each page).

## External resources

Google Fonts (Baloo 2, Nunito) and jsPDF (cdnjs) are loaded from their CDNs.
