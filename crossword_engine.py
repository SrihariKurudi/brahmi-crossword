"""Crossword generation engine operating on akshara units."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any


@dataclass
class PlacedWord:
    word: str
    aksharas: list[str]
    row: int
    col: int
    direction: str  # "across" or "down"
    clue: str = ""
    number: int = 0


class CrosswordEngine:
    def __init__(self, size: int = 15, seed: int = 42) -> None:
        self.size = size
        self.grid: list[list[dict[str, str] | None]] = [
            [None for _ in range(size)] for _ in range(size)
        ]
        self.placed_words: list[PlacedWord] = []
        self.random = random.Random(seed)

    def _in_bounds(self, row: int, col: int) -> bool:
        return 0 <= row < self.size and 0 <= col < self.size

    def _step(self, direction: str) -> tuple[int, int]:
        return (0, 1) if direction == "across" else (1, 0)

    def _cell(self, row: int, col: int) -> dict[str, str] | None:
        if not self._in_bounds(row, col):
            return None
        return self.grid[row][col]

    def _is_empty(self, row: int, col: int) -> bool:
        return self._cell(row, col) is None

    def _adjacent_ok(self, row: int, col: int, direction: str) -> bool:
        """For empty target cells, ensure no side-adjacent touching letters."""
        if direction == "across":
            return self._is_empty(row - 1, col) and self._is_empty(row + 1, col)
        return self._is_empty(row, col - 1) and self._is_empty(row, col + 1)

    def can_place(self, aksharas: list[str], row: int, col: int, direction: str, require_intersection: bool) -> bool:
        dr, dc = self._step(direction)
        length = len(aksharas)

        end_row = row + dr * (length - 1)
        end_col = col + dc * (length - 1)
        if not self._in_bounds(row, col) or not self._in_bounds(end_row, end_col):
            return False

        # Prevent words from running into existing letters.
        prev_row, prev_col = row - dr, col - dc
        next_row, next_col = end_row + dr, end_col + dc
        if self._in_bounds(prev_row, prev_col) and not self._is_empty(prev_row, prev_col):
            return False
        if self._in_bounds(next_row, next_col) and not self._is_empty(next_row, next_col):
            return False

        intersections = 0

        for idx, ak in enumerate(aksharas):
            r = row + dr * idx
            c = col + dc * idx
            existing = self.grid[r][c]

            if existing is not None:
                if existing["solution"] != ak:
                    return False
                intersections += 1
            else:
                if not self._adjacent_ok(r, c, direction):
                    return False

        if require_intersection and intersections == 0:
            return False

        return True

    def place_word(self, word: str, aksharas: list[str], row: int, col: int, direction: str, clue: str = "") -> None:
        dr, dc = self._step(direction)
        for idx, ak in enumerate(aksharas):
            r = row + dr * idx
            c = col + dc * idx
            if self.grid[r][c] is None:
                self.grid[r][c] = {"akshara": "", "solution": ak}
        self.placed_words.append(PlacedWord(word, aksharas, row, col, direction, clue=clue))

    def _positions_for_akshara(self, akshara: str) -> list[tuple[int, int]]:
        positions: list[tuple[int, int]] = []
        for r in range(self.size):
            for c in range(self.size):
                cell = self.grid[r][c]
                if cell and cell["solution"] == akshara:
                    positions.append((r, c))
        return positions

    def _candidate_intersections(self, aksharas: list[str]) -> list[tuple[int, int, str]]:
        candidates: list[tuple[int, int, str]] = []
        for i, ak in enumerate(aksharas):
            for r, c in self._positions_for_akshara(ak):
                # Word can cross through this cell in both directions.
                candidates.append((r, c - i, "across"))
                candidates.append((r - i, c, "down"))
        self.random.shuffle(candidates)
        return candidates

    def _random_candidates(self, aksharas: list[str], count: int = 200) -> list[tuple[int, int, str]]:
        candidates: list[tuple[int, int, str]] = []
        for _ in range(count):
            direction = self.random.choice(["across", "down"])
            if direction == "across":
                row = self.random.randrange(self.size)
                col = self.random.randrange(max(1, self.size - len(aksharas) + 1))
            else:
                row = self.random.randrange(max(1, self.size - len(aksharas) + 1))
                col = self.random.randrange(self.size)
            candidates.append((row, col, direction))
        return candidates

    def generate(self, words_with_aksharas: list[tuple[str, list[str], str]], max_attempts: int = 500) -> list[PlacedWord]:
        if not words_with_aksharas:
            return []

        # Place longer words first for better fit.
        words_sorted = sorted(words_with_aksharas, key=lambda item: len(item[1]), reverse=True)

        first_word, first_aksharas, first_clue = words_sorted[0]
        start_row = self.size // 2
        start_col = max(0, (self.size - len(first_aksharas)) // 2)
        if not self.can_place(first_aksharas, start_row, start_col, "across", require_intersection=False):
            raise RuntimeError("Unable to place the first word in the grid center.")
        self.place_word(first_word, first_aksharas, start_row, start_col, "across", clue=first_clue)

        for word, aksharas, clue in words_sorted[1:]:
            placed = False

            # 1) Prefer intersection-based placements.
            intersection_candidates = self._candidate_intersections(aksharas)
            attempts = 0
            for row, col, direction in intersection_candidates:
                attempts += 1
                if attempts > max_attempts:
                    break
                if self.can_place(aksharas, row, col, direction, require_intersection=True):
                    self.place_word(word, aksharas, row, col, direction, clue=clue)
                    placed = True
                    break

            # 2) Fallback random placement.
            if not placed:
                for row, col, direction in self._random_candidates(aksharas, count=max_attempts):
                    if self.can_place(aksharas, row, col, direction, require_intersection=False):
                        self.place_word(word, aksharas, row, col, direction, clue=clue)
                        placed = True
                        break

            if not placed:
                # If a word cannot be placed, continue with remaining words.
                continue

        self._assign_numbers()
        return self.placed_words

    def _assign_numbers(self) -> None:
        start_to_number: dict[tuple[int, int], int] = {}
        number = 1

        for r in range(self.size):
            for c in range(self.size):
                if self.grid[r][c] is None:
                    continue
                starts_across = self._is_empty(r, c - 1) and not self._is_empty(r, c + 1)
                starts_down = self._is_empty(r - 1, c) and not self._is_empty(r + 1, c)
                if starts_across or starts_down:
                    start_to_number[(r, c)] = number
                    number += 1

        for placed in self.placed_words:
            placed.number = start_to_number.get((placed.row, placed.col), 0)

    def to_export_payload(self) -> dict[str, Any]:
        numbers: dict[tuple[int, int], int] = {}
        for pw in self.placed_words:
            if pw.number:
                numbers[(pw.row, pw.col)] = pw.number

        across = [pw for pw in self.placed_words if pw.direction == "across" and pw.number > 0]
        down = [pw for pw in self.placed_words if pw.direction == "down" and pw.number > 0]
        across.sort(key=lambda w: w.number)
        down.sort(key=lambda w: w.number)

        return {
            "size": self.size,
            "grid": self.grid,
            "numbers": numbers,
            "across": across,
            "down": down,
        }
