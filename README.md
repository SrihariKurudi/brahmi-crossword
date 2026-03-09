# Sanskrit Crossword Generator (Akshara-based)

Offline Python project to generate Sanskrit crosswords from Devanagari words, using akshara units (syllabic clusters) instead of single Unicode characters.

## Project Layout

```text
sanskrit-crossword/
  terms.csv
  generate_crossword.py
  akshara.py
  crossword_engine.py
  html_exporter.py
  templates/
    crossword_template.html
  output/
    crossword.html
```

## Requirements

- Python 3 (no external dependencies)

## Installation

1. Open terminal in `sanskrit-crossword`.
2. Ensure `python --version` shows Python 3.

## Edit Input File

Only one input file is required:

- `terms.csv` with headers: `word,clue`

Example:

```csv
word,clue
??????,flow
????,blood
????,heart
```

## Run

```bash
python generate_crossword.py
```

Optional parameters:

```bash
python generate_crossword.py --size 17 --title "Ayurveda Crossword" --seed 7
```

Optional terms path:

```bash
python generate_crossword.py --terms terms.csv
```

## Output

- HTML crossword generated at `output/crossword.html`.
- Open this file in any browser.
- Works fully offline.

## Features

- Akshara splitting for Devanagari conjuncts/matras
- Across/Down clue numbering
- Interactive answer entry
- Check answers (green/red highlighting)
- Reveal solution button
- Clear grid button
- Print-friendly stylesheet

## Web Version (`web/`)

The repository also includes a browser-first web app under `web/` (GitHub Pages compatible).

### Web files

- `web/index.html` - UI shell
- `web/style.css` - responsive styles
- `web/crossword.js` - crossword generation/render/check/reveal logic
- `web/sheet_loader.js` - Google Sheet CSV loader/parser/filtering
- `web/akshara.js` - akshara splitter for web runtime

### Web data format (Google Sheet)

Use CSV headers:

```csv
word,clue,tag,used_in_mag
```

- `word`: answer to place in crossword
- `clue`: clue shown in Across/Down list
- `tag`: subject/category (used for diversity + colored tag label in hints)
- `used_in_mag`: if non-empty, row is excluded from the web puzzle pool

### Web hint display

Each hint shows:

- clue text
- solution word
- akshara count
- subject tag (color-coded per tag)

Example:

```text
1. flow (प्रवाह, 3 अक्षर, भैषज्य)
```
