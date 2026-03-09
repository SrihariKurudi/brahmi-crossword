"""HTML exporter for Sanskrit akshara crossword."""

from __future__ import annotations

from pathlib import Path
from typing import Any


def _escape_html(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _build_grid_html(payload: dict[str, Any]) -> str:
    grid = payload["grid"]
    numbers = payload["numbers"]
    rows: list[str] = []

    for r, row in enumerate(grid):
        cells: list[str] = []
        for c, cell in enumerate(row):
            if cell is None:
                cells.append('<td class="block"></td>')
                continue

            number = numbers.get((r, c), "")
            solution = _escape_html(cell["solution"])
            number_html = f'<span class="num">{number}</span>' if number else ""
            cells.append(
                "".join(
                    [
                        '<td class="square">',
                        number_html,
                        f'<input type="text" class="cell-input" data-solution="{solution}" ',
                        f'data-row="{r}" data-col="{c}" autocomplete="off" spellcheck="false" />',
                        "</td>",
                    ]
                )
            )
        rows.append("<tr>" + "".join(cells) + "</tr>")

    return "\n".join(rows)


def _build_clues_html(entries: list[Any]) -> str:
    items: list[str] = []
    for entry in entries:
        clue = _escape_html(entry.clue or "")
        answer = _escape_html(entry.word)
        items.append(
            f'<li><strong>{entry.number}.</strong> {clue} '
            f'<span class="answer-meta">({answer}, {len(entry.aksharas)} aksharas)</span></li>'
        )
    return "\n".join(items)


def export_html(
    payload: dict[str, Any],
    template_path: Path,
    output_path: Path,
    title: str = "Sanskrit Crossword",
) -> None:
    template = template_path.read_text(encoding="utf-8")

    html = (
        template.replace("{{TITLE}}", _escape_html(title))
        .replace("{{GRID_ROWS}}", _build_grid_html(payload))
        .replace("{{ACROSS_CLUES}}", _build_clues_html(payload["across"]))
        .replace("{{DOWN_CLUES}}", _build_clues_html(payload["down"]))
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")
