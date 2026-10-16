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

The three HTML files in the repo root are generated, so edit `src/` and rebuild:

```
node build.js
```

| Source | Purpose |
| --- | --- |
| `src/maze.template.html` | Shared page for `index.html` and `print.html` (maze generator, UI, texts) |
| `src/pdf-maze.js` | Maze PDF drawing |
| `src/puzzles.template.html` | Puzzles page (UI, texts, PDF export) |
| `src/puzzle-*.js` | Puzzle generators and drawing: core, words, wordsearch, dots, math, scramble, spot |
| `src/fonts/*.b64` | DejaVu Sans subsets (base64) embedded for the PDFs |

Languages are Hungarian and English only (texts live in the `T` dictionaries in the templates).

## External resources

Google Fonts (Baloo 2, Nunito) and jsPDF (cdnjs) are loaded from their CDNs.
