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

function buildTagColorMap(payload) {
  const tags = Array.from(
    new Set(
      [...payload.across, ...payload.down]
        .map((entry) => clean(entry.tag))
        .filter((tag) => tag.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b, "hi"));

  const map = new Map();
  for (let i = 0; i < tags.length; i += 1) {
    const hue = (i * 67) % 360;
    map.set(tags[i], `hsl(${hue} 60% 38%)`);
  }
  return map;
}

function createClueItem(clue, tagColors) {
  const li = document.createElement("li");
  const number = document.createElement("strong");
  number.textContent = `${clue.number}.`;
  li.appendChild(number);
  li.append(` ${clue.clue || ""} `);

  const meta = document.createElement("span");
  meta.className = "clue-meta";
  const count = clue.aksharas?.length || splitAksharas(clue.word || "").length;
  const solution = clue.word || "";
  const tag = clean(clue.tag);

  meta.append(`(${solution}, ${count} अक्षर`);
  if (tag) {
    meta.append(", ");
    const tagEl = document.createElement("span");
    tagEl.className = "clue-tag";
    tagEl.textContent = tag;
    if (tagColors.has(tag)) {
      tagEl.style.setProperty("--tag-color", tagColors.get(tag));
    }
    meta.appendChild(tagEl);
  }
  meta.append(")");

  li.appendChild(meta);
  return li;
}

class CrosswordEngine {
  constructor(size = 10) {
    this.size = size;
    this.grid = Array.from({ length: size }, () => Array.from({ length: size }, () => null));
    this.placedWords = [];
    this.totalIntersections = 0;
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

  analyzePlacement(aksharas, row, col, direction) {
    const [dr, dc] = this.step(direction);
    const length = aksharas.length;
    const endRow = row + dr * (length - 1);
    const endCol = col + dc * (length - 1);

    if (!this.inBounds(row, col) || !this.inBounds(endRow, endCol)) {
      return null;
    }

    const prevRow = row - dr;
    const prevCol = col - dc;
    const nextRow = endRow + dr;
    const nextCol = endCol + dc;

    if (this.inBounds(prevRow, prevCol) && !this.isEmpty(prevRow, prevCol)) {
      return null;
    }
    if (this.inBounds(nextRow, nextCol) && !this.isEmpty(nextRow, nextCol)) {
      return null;
    }

    let intersections = 0;
    let emptyCellsCreated = 0;
    const touched = [];
    for (let i = 0; i < length; i += 1) {
      const r = row + dr * i;
      const c = col + dc * i;
      const existing = this.grid[r][c];
      const ak = aksharas[i];

      if (existing !== null) {
        if (existing.solution !== ak) {
          return null;
        }
        intersections += 1;
        touched.push([r, c]);
      } else if (!this.adjacentOk(r, c, direction)) {
        return null;
      } else {
        emptyCellsCreated += 1;
      }
    }

    return {
      row,
      col,
      direction,
      intersectionsCreated: intersections,
      emptyCellsCreated,
      touched,
    };
  }

  buildClusterMap() {
    const clusterAt = new Map();
    let nextId = 0;

    for (let r = 0; r < this.size; r += 1) {
      for (let c = 0; c < this.size; c += 1) {
        if (this.grid[r][c] === null || clusterAt.has(key(r, c))) {
          continue;
        }

        nextId += 1;
        const queue = [[r, c]];
        clusterAt.set(key(r, c), nextId);

        while (queue.length > 0) {
          const [curRow, curCol] = queue.shift();
          const neighbors = [
            [curRow - 1, curCol],
            [curRow + 1, curCol],
            [curRow, curCol - 1],
            [curRow, curCol + 1],
          ];

          for (const [nr, nc] of neighbors) {
            const cellKey = key(nr, nc);
            if (!this.inBounds(nr, nc) || this.grid[nr][nc] === null || clusterAt.has(cellKey)) {
              continue;
            }
            clusterAt.set(cellKey, nextId);
            queue.push([nr, nc]);
          }
        }
      }
    }

    return clusterAt;
  }

  scorePlacement(placement, clusterMap) {
    const touchedClusters = new Set();
    for (const [r, c] of placement.touched) {
      const clusterId = clusterMap.get(key(r, c));
      if (clusterId) {
        touchedClusters.add(clusterId);
      }
    }

    const adjacencyBonus = touchedClusters.size >= 2 ? 1 : 0;
    return {
      ...placement,
      adjacencyBonus,
      placementScore:
        placement.intersectionsCreated * 5 +
        adjacencyBonus * 2 -
        placement.emptyCellsCreated,
    };
  }

  allCandidates(aksharas) {
    const candidates = [];
    const directions = shuffle(["across", "down"]);

    for (const direction of directions) {
      const maxRow = direction === "down" ? this.size - aksharas.length : this.size - 1;
      const maxCol = direction === "across" ? this.size - aksharas.length : this.size - 1;
      const rowOrder = shuffle(Array.from({ length: maxRow + 1 }, (_, i) => i));
      const colOrder = shuffle(Array.from({ length: maxCol + 1 }, (_, i) => i));

      for (const row of rowOrder) {
        for (const col of colOrder) {
          const candidate = this.analyzePlacement(aksharas, row, col, direction);
          if (candidate) {
            candidates.push(candidate);
          }
        }
      }
    }

    return candidates;
  }

  bestPlacement(entry) {
    const clusterMap = this.buildClusterMap();
    const scored = this.allCandidates(entry.aksharas)
      .map((candidate) => this.scorePlacement(candidate, clusterMap));

    if (scored.length === 0) {
      return null;
    }

    const strong = scored.filter((candidate) => candidate.intersectionsCreated >= 2);
    const viable = strong.length > 0 ? strong : scored.filter((candidate) => candidate.intersectionsCreated > 0);
    const pool = viable.length > 0 ? viable : scored;
    const bestScore = Math.max(...pool.map((candidate) => candidate.placementScore));
    const best = pool.filter((candidate) => candidate.placementScore === bestScore);
    return best[Math.floor(Math.random() * best.length)];
  }

  placeWord(entry, placement) {
    const { row, col, direction, intersectionsCreated = 0 } = placement;
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
      tag: entry.tag,
      aksharas: entry.aksharas,
      row,
      col,
      direction,
      intersections: intersectionsCreated,
      number: 0,
    });
    this.totalIntersections += intersectionsCreated;
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
      totalIntersections: this.totalIntersections,
    };
  }
}

function prepareWords(words) {
  return words
    .map((entry) => ({
      word: clean(entry.word),
      clue: clean(entry.clue),
      tag: clean(entry.tag),
      aksharas: splitAksharas(clean(entry.word)),
    }))
    .filter((entry) => entry.word && entry.aksharas.length > 0);

}

function seedPlacement(size, entry) {
  const direction = Math.random() < 0.5 ? "across" : "down";
  if (direction === "across") {
    return {
      row: Math.floor(size / 2),
      col: Math.max(0, Math.floor((size - entry.aksharas.length) / 2)),
      direction,
      intersectionsCreated: 0,
    };
  }

  return {
    row: Math.max(0, Math.floor((size - entry.aksharas.length) / 2)),
    col: Math.floor(size / 2),
    direction,
    intersectionsCreated: 0,
  };
}

function generateSingleCrossword(prepared, size) {
  const engine = new CrosswordEngine(size);
  const randomized = shuffle(prepared);

  let firstIndex = 0;
  for (let i = 1; i < randomized.length; i += 1) {
    if (randomized[i].aksharas.length > randomized[firstIndex].aksharas.length) {
      firstIndex = i;
    }
  }

  const [first] = randomized.splice(firstIndex, 1);
  const firstPlacement = seedPlacement(size, first);
  if (!engine.analyzePlacement(first.aksharas, firstPlacement.row, firstPlacement.col, firstPlacement.direction)) {
    throw new Error("Unable to place first word.");
  }
  engine.placeWord(first, firstPlacement);

  for (const entry of randomized) {
    const placement = engine.bestPlacement(entry);
    if (placement) {
      engine.placeWord(entry, placement);
    }
  }

  engine.assignNumbers();
  return engine;
}

function puzzleScore(engine) {
  const occupied = engine.grid.reduce(
    (sum, row) => sum + row.reduce((count, cell) => count + (cell ? 1 : 0), 0),
    0
  );
  const emptyCells = engine.size * engine.size - occupied;
  const wordsWithOnlyOneIntersection = engine.placedWords.filter((word) => word.intersections === 1).length;

  return (
    engine.totalIntersections * 6 +
    engine.placedWords.length * 3 -
    emptyCells -
    wordsWithOnlyOneIntersection * 4
  );
}

export function generateCrossword(words, size = 10) {
  const prepared = prepareWords(words);

  if (prepared.length === 0) {
    throw new Error("No valid words found.");
  }

  let bestEngine = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const generations = 30;

  for (let i = 0; i < generations; i += 1) {
    const engine = generateSingleCrossword(prepared, size);
    const score = puzzleScore(engine);
    if (score > bestScore) {
      bestScore = score;
      bestEngine = engine;
    }
  }

  if (!bestEngine) {
    throw new Error("Unable to generate crossword.");
  }

  return {
    ...bestEngine.toPayload(),
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

  table.style.setProperty("--grid-size", String(payload.size));
  enableKeyboardNavigation(table);
  const tagColors = buildTagColorMap(payload);

  for (const clue of payload.across) {
    acrossList.appendChild(createClueItem(clue, tagColors));
  }

  for (const clue of payload.down) {
    downList.appendChild(createClueItem(clue, tagColors));
  }
}

export function getInputCells(root) {
  return Array.from(root.querySelectorAll(".cell-input"));
}

function getCellInput(table, row, col) {
  return table.querySelector(`.cell-input[data-row="${row}"][data-col="${col}"]`);
}

function focusNextCell(table, row, col, dr, dc) {
  let r = row + dr;
  let c = col + dc;
  const size = Number(table.style.getPropertyValue("--grid-size")) || 0;

  while (r >= 0 && c >= 0 && r < size && c < size) {
    const input = getCellInput(table, r, c);
    if (input) {
      input.focus();
      return true;
    }
    r += dr;
    c += dc;
  }
  return false;
}

function enableKeyboardNavigation(table) {
  if (table.dataset.keyboardNavBound === "1") {
    return;
  }
  table.dataset.keyboardNavBound = "1";

  table.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains("cell-input")) {
      return;
    }

    const row = Number(target.dataset.row);
    const col = Number(target.dataset.col);
    let moved = false;

    if (event.key === "ArrowUp") {
      moved = focusNextCell(table, row, col, -1, 0);
    } else if (event.key === "ArrowDown") {
      moved = focusNextCell(table, row, col, 1, 0);
    } else if (event.key === "ArrowLeft") {
      moved = focusNextCell(table, row, col, 0, -1);
    } else if (event.key === "ArrowRight") {
      moved = focusNextCell(table, row, col, 0, 1);
    }

    if (moved) {
      event.preventDefault();
    }
  });
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
