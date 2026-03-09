"""Generate a Sanskrit akshara-based crossword and export as HTML.

Usage:
    python generate_crossword.py
    python generate_crossword.py --size 17 --title "Ayurveda Crossword"
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

from akshara import split_aksharas
from crossword_engine import CrosswordEngine
from html_exporter import export_html


def load_terms(path: Path) -> list[tuple[str, list[str], str]]:
    words_with_aksharas: list[tuple[str, list[str], str]] = []
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            word = row["word"].strip()
            clue = row["clue"].strip()
            if not word:
                continue
            words_with_aksharas.append((word, split_aksharas(word), clue))
    return words_with_aksharas


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Sanskrit crossword from terms CSV file.")
    parser.add_argument("--size", type=int, default=15, help="Grid size (default: 15)")
    parser.add_argument("--terms", default="terms.csv", help="Path to terms CSV")
    parser.add_argument("--output", default="output/crossword.html", help="Output HTML path")
    parser.add_argument("--template", default="templates/crossword_template.html", help="HTML template path")
    parser.add_argument("--title", default="Sanskrit Akshara Crossword", help="Title shown in HTML")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducible layouts")
    args = parser.parse_args()

    base = Path(__file__).resolve().parent
    terms_path = (base / args.terms).resolve()
    output_path = (base / args.output).resolve()
    template_path = (base / args.template).resolve()

    words_with_aksharas = load_terms(terms_path)

    engine = CrosswordEngine(size=args.size, seed=args.seed)
    placed = engine.generate(words_with_aksharas)

    payload = engine.to_export_payload()
    export_html(payload, template_path=template_path, output_path=output_path, title=args.title)

    def safe_print(text: str) -> None:
        encoding = sys.stdout.encoding or "utf-8"
        sys.stdout.write(text.encode(encoding, errors="backslashreplace").decode(encoding) + "\n")

    safe_print(f"Terms in input: {len(words_with_aksharas)}")
    safe_print(f"Words placed: {len(placed)}")
    safe_print(f"Output file: {output_path}")


if __name__ == "__main__":
    main()
