import { splitAksharas } from "./akshara.js";

function key(row, col) {
  return `${row},${col}`;
}

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function clean(value) {
  return (value || "").trim().normalize("NFC");
}

class CrosswordEngine {
  constructor(size = 15) {
    this.size = size;
    this.grid = Array.from({ length: size }, () => Array.from({ length: size }, () => null));
    this.placedWords = [];
  }

  inBounds(row, col) {
    return row >= 0 && row < this.size && col >= 0 && col < this.size;
  }

  step(direction) {
    return direction === "across" ? [0, 1] : [1, 0];
  }

  cell(row, col) {
    if (!this.inBounds(row, col)) {
      return null;
    }
    return this.grid[row][col];
  }

  isEmpty(row, col) {
    return this.cell(row, col) === null;
  }

  adjacentOk(row, col, direction) {
    if (direction === "across") {
      return this.isEmpty(row - 1, col) && this.isEmpty(row + 1, col);
    }
    return this.isEmpty(row, col - 1) && this.isEmpty(row, col + 1);
  }

  canPlace(aksharas, row, col, direction, requireIntersection) {
    const [dr, dc] = this.step(direction);
    const length = aksharas.length;
    const endRow = row + dr * (length - 1);
    const endCol = col + dc * (length - 1);

    if (!this.inBounds(row, col) || !this.inBounds(endRow, endCol)) {
      return false;
    }

    const prevRow = row - dr;
    const prevCol = col - dc;
    const nextRow = endRow + dr;
    const nextCol = endCol + dc;

    if (this.inBounds(prevRow, prevCol) && !this.isEmpty(prevRow, prevCol)) {
      return false;
    }
    if (this.inBounds(nextRow, nextCol) && !this.isEmpty(nextRow, nextCol)) {
      return false;
    }

    let intersections = 0;
    for (let i = 0; i < length; i += 1) {
      const r = row + dr * i;
      const c = col + dc * i;
      const existing = this.grid[r][c];
      const ak = aksharas[i];

      if (existing !== null) {
        if (existing.solution !== ak) {
          return false;
        }
        intersections += 1;
      } else if (!this.adjacentOk(r, c, direction)) {
        return false;
      }
    }

    if (requireIntersection && intersections === 0) {
      return false;
    }
    return true;
  }

  placeWord(entry, row, col, direction) {
    const [dr, dc] = this.step(direction);
    for (let i = 0; i < entry.aksharas.length; i += 1) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (this.grid[r][c] === null) {
        this.grid[r][c] = { solution: entry.aksharas[i] };
      }
    }
    this.placedWords.push({
      word: entry.word,
      clue: entry.clue,
      aksharas: entry.aksharas,
      row,
      col,
      direction,
      number: 0,
    });
  }

  positionsForAkshara(akshara) {
    const found = [];
    for (let r = 0; r < this.size; r += 1) {
      for (let c = 0; c < this.size; c += 1) {
        const cell = this.grid[r][c];
        if (cell && cell.solution === akshara) {
          found.push([r, c]);
        }
      }
    }
    return found;
  }

  intersectionCandidates(aksharas) {
    const list = [];
    for (let i = 0; i < aksharas.length; i += 1) {
      const ak = aksharas[i];
      const positions = this.positionsForAkshara(ak);
      for (const [r, c] of positions) {
        list.push([r, c - i, "across"]);
        list.push([r - i, c, "down"]);
      }
    }
    return shuffle(list);
  }

  randomCandidates(aksharas, count = 500) {
    const list = [];
    for (let i = 0; i < count; i += 1) {
      const direction = Math.random() < 0.5 ? "across" : "down";
      if (direction === "across") {
        const row = Math.floor(Math.random() * this.size);
        const col = Math.floor(Math.random() * Math.max(1, this.size - aksharas.length + 1));
        list.push([row, col, direction]);
      } else {
        const row = Math.floor(Math.random() * Math.max(1, this.size - aksharas.length + 1));
        const col = Math.floor(Math.random() * this.size);
        list.push([row, col, direction]);
      }
    }
    return list;
  }

  assignNumbers() {
    const numberAt = new Map();
    let n = 1;

    for (let r = 0; r < this.size; r += 1) {
      for (let c = 0; c < this.size; c += 1) {
        if (this.grid[r][c] === null) {
          continue;
        }
        const startsAcross = this.isEmpty(r, c - 1) && !this.isEmpty(r, c + 1);
        const startsDown = this.isEmpty(r - 1, c) && !this.isEmpty(r + 1, c);
        if (startsAcross || startsDown) {
          numberAt.set(key(r, c), n);
          n += 1;
        }
      }
    }

    for (const word of this.placedWords) {
      word.number = numberAt.get(key(word.row, word.col)) || 0;
    }
  }

  toPayload() {
    const numbers = new Map();
    for (const word of this.placedWords) {
      if (word.number > 0) {
        numbers.set(key(word.row, word.col), word.number);
      }
    }

    const across = this.placedWords
      .filter((w) => w.direction === "across" && w.number > 0)
      .sort((a, b) => a.number - b.number);
    const down = this.placedWords
      .filter((w) => w.direction === "down" && w.number > 0)
      .sort((a, b) => a.number - b.number);

    return {
      size: this.size,
      grid: this.grid,
      numbers,
      across,
      down,
      placedCount: this.placedWords.length,
    };
  }
}

export function generateCrossword(words, size = 15) {
  const prepared = words
    .map((entry) => ({
      word: clean(entry.word),
      clue: clean(entry.clue),
      aksharas: splitAksharas(clean(entry.word)),
    }))
    .filter((entry) => entry.word && entry.aksharas.length > 0);

  if (prepared.length === 0) {
    throw new Error("No valid words found.");
  }

  const randomized = shuffle(prepared);
  randomized.sort((a, b) => b.aksharas.length - a.aksharas.length);

  const engine = new CrosswordEngine(size);

  const first = randomized[0];
  const firstRow = Math.floor(size / 2);
  const firstCol = Math.max(0, Math.floor((size - first.aksharas.length) / 2));
  if (!engine.canPlace(first.aksharas, firstRow, firstCol, "across", false)) {
    throw new Error("Unable to place first word.");
  }
  engine.placeWord(first, firstRow, firstCol, "across");

  const maxAttempts = 500;
  for (const entry of randomized.slice(1)) {
    let placed = false;

    let attempts = 0;
    const intersect = engine.intersectionCandidates(entry.aksharas);
    for (const [row, col, direction] of intersect) {
      attempts += 1;
      if (attempts > maxAttempts) {
        break;
      }
      if (engine.canPlace(entry.aksharas, row, col, direction, true)) {
        engine.placeWord(entry, row, col, direction);
        placed = true;
        break;
      }
    }

    if (!placed) {
      const fallback = engine.randomCandidates(entry.aksharas, maxAttempts);
      for (const [row, col, direction] of fallback) {
        if (engine.canPlace(entry.aksharas, row, col, direction, false)) {
          engine.placeWord(entry, row, col, direction);
          placed = true;
          break;
        }
      }
    }
  }

  engine.assignNumbers();
  return {
    ...engine.toPayload(),
    inputCount: prepared.length,
  };
}

export function renderPuzzle(payload, root) {
  const table = root.querySelector("#crossword-grid");
  const acrossList = root.querySelector("#across-list");
  const downList = root.querySelector("#down-list");
  table.innerHTML = "";
  acrossList.innerHTML = "";
  downList.innerHTML = "";

  for (let r = 0; r < payload.size; r += 1) {
    const tr = document.createElement("tr");

    for (let c = 0; c < payload.size; c += 1) {
      const cell = payload.grid[r][c];
      const td = document.createElement("td");

      if (!cell) {
        td.className = "block";
      } else {
        td.className = "square";
        const num = payload.numbers.get(key(r, c));
        if (num) {
          const label = document.createElement("span");
          label.className = "num";
          label.textContent = String(num);
          td.appendChild(label);
        }

        const input = document.createElement("input");
        input.className = "cell-input";
        input.type = "text";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.dataset.solution = cell.solution;
        input.dataset.row = String(r);
        input.dataset.col = String(c);
        td.appendChild(input);
      }

      tr.appendChild(td);
    }

    table.appendChild(tr);
  }

  for (const clue of payload.across) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${clue.number}.</strong> ${escapeHtml(clue.clue || "")}`;
    acrossList.appendChild(li);
  }

  for (const clue of payload.down) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${clue.number}.</strong> ${escapeHtml(clue.clue || "")}`;
    downList.appendChild(li);
  }
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function getInputCells(root) {
  return Array.from(root.querySelectorAll(".cell-input"));
}

export function checkAnswers(root) {
  for (const input of getInputCells(root)) {
    input.classList.remove("correct", "incorrect");
    const expected = clean(input.dataset.solution);
    const actual = clean(input.value);
    if (!actual) {
      continue;
    }
    if (actual === expected) {
      input.classList.add("correct");
    } else {
      input.classList.add("incorrect");
    }
  }
}

export function revealAnswers(root) {
  for (const input of getInputCells(root)) {
    input.value = input.dataset.solution || "";
    input.classList.remove("incorrect");
    input.classList.add("correct");
  }
}

export function clearAnswers(root) {
  for (const input of getInputCells(root)) {
    input.value = "";
    input.classList.remove("correct", "incorrect");
  }
}
