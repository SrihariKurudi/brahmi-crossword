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
    this.nextWordId = 1;
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
    const intersectedWordIds = new Set();
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
        for (const ownerId of existing.owners || []) {
          intersectedWordIds.add(ownerId);
        }
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
      uniqueWordsIntersected: intersectedWordIds.size,
      intersectionsCreated: intersections,
      emptyCellsCreated,
      touched,
    };
  }

  scaffoldConnectionBonus(placement) {
    const { row, col, direction } = placement;
    const fixedDirection = direction === "across" ? "down" : "across";
    const [dr, dc] = this.step(direction);
    const covered = [];

    for (const word of this.placedWords) {
      if (word.direction !== fixedDirection) {
        continue;
      }

      if (direction === "down") {
        const startCol = word.col;
        const endCol = word.col + word.aksharas.length - 1;
        if (col < startCol || col > endCol) {
          continue;
        }
        if (word.row < row || word.row > row + dr * (placement.emptyCellsCreated + placement.intersectionsCreated - 1)) {
          continue;
        }
      } else {
        const startRow = word.row;
        const endRow = word.row + word.aksharas.length - 1;
        if (row < startRow || row > endRow) {
          continue;
        }
        if (word.col < col || word.col > col + dc * (placement.emptyCellsCreated + placement.intersectionsCreated - 1)) {
          continue;
        }
      }

      covered.push(word.id);
    }

    return new Set(covered).size >= 2 ? 1 : 0;
  }

  scorePlacement(placement) {
    const scaffoldConnectionBonus = this.scaffoldConnectionBonus(placement);
    return {
      ...placement,
      scaffoldConnectionBonus,
      placementScore:
        placement.uniqueWordsIntersected * 7 +
        placement.intersectionsCreated * 3 +
        scaffoldConnectionBonus * 2 -
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
    const scored = this.allCandidates(entry.aksharas)
      .map((candidate) => this.scorePlacement(candidate));

    if (scored.length === 0) {
      return null;
    }

    const bridgePool = scored.filter(
      (candidate) => candidate.intersectionsCreated >= 2 && candidate.uniqueWordsIntersected >= 2
    );
    const densePool = scored.filter((candidate) => candidate.intersectionsCreated >= 2);
    const intersectingPool = scored.filter((candidate) => candidate.uniqueWordsIntersected >= 1);
    const pool = bridgePool.length > 0
      ? bridgePool
      : densePool.length > 0
        ? densePool
        : intersectingPool.length > 0
          ? intersectingPool
          : scored;
    const bestScore = Math.max(...pool.map((candidate) => candidate.placementScore));
    const best = pool.filter((candidate) => candidate.placementScore === bestScore);
    return best[Math.floor(Math.random() * best.length)];
  }

  placeWord(entry, placement) {
    const { row, col, direction, intersectionsCreated = 0 } = placement;
    const [dr, dc] = this.step(direction);
    const wordId = this.nextWordId;
    this.nextWordId += 1;
    for (let i = 0; i < entry.aksharas.length; i += 1) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (this.grid[r][c] === null) {
        this.grid[r][c] = { solution: entry.aksharas[i], owners: [wordId] };
      } else if (!this.grid[r][c].owners.includes(wordId)) {
        this.grid[r][c].owners.push(wordId);
      }
    }
    this.placedWords.push({
      id: wordId,
      word: entry.word,
      clue: entry.clue,
      tag: entry.tag,
      aksharas: entry.aksharas,
      row,
      col,
      direction,
      intersectionWords: placement.uniqueWordsIntersected || 0,
      intersections: intersectionsCreated,
      number: 0,
    });
    this.totalIntersections += intersectionsCreated;
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
  const prepared = words
    .map((entry) => ({
      word: clean(entry.word),
      clue: clean(entry.clue),
      tag: clean(entry.tag),
      aksharas: splitAksharas(clean(entry.word)),
    }))
    .filter((entry) => entry.word && entry.aksharas.length > 0);

  const aksharaFrequency = new Map();
  for (const entry of prepared) {
    for (const akshara of entry.aksharas) {
      aksharaFrequency.set(akshara, (aksharaFrequency.get(akshara) || 0) + 1);
    }
  }

  return prepared.map((entry) => ({
    ...entry,
    intersectionPotential: entry.aksharas.reduce(
      (sum, akshara) => sum + (aksharaFrequency.get(akshara) || 0),
      0
    ),
  }));
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

function pickSeedCandidates(prepared, count = 20) {
  const ranked = prepared
    .slice()
    .sort((a, b) => b.intersectionPotential - a.intersectionPotential);
  return ranked.slice(0, Math.min(count, ranked.length));
}

function generateSingleCrossword(prepared, size) {
  const engine = new CrosswordEngine(size);
  const seedPool = pickSeedCandidates(prepared);
  const firstCandidates = shuffle([...seedPool, ...prepared.filter((entry) => !seedPool.includes(entry))]);
  let first = null;

  for (const candidate of firstCandidates) {
    const placement = seedPlacement(size, candidate);
    if (engine.analyzePlacement(candidate.aksharas, placement.row, placement.col, placement.direction)) {
      first = candidate;
      engine.placeWord(candidate, placement);
      break;
    }
  }

  if (!first) {
    throw new Error("Unable to place first word.");
  }

  const remaining = prepared.filter((entry) => entry !== first);
  const secondSeedOptions = shuffle(seedPool.filter((entry) => entry !== first));
  const randomized = shuffle(remaining);

  let secondPlaced = false;
  for (const entry of secondSeedOptions) {
    const placement = engine.bestPlacement(entry);
    if (placement && placement.intersectionsCreated > 0) {
      engine.placeWord(entry, placement);
      secondPlaced = true;
      break;
    }
  }

  const queue = randomized.filter((entry) => !engine.placedWords.some((word) => word.word === entry.word));
  if (!secondPlaced) {
    for (const entry of queue) {
      const placement = engine.bestPlacement(entry);
      if (placement && placement.intersectionsCreated > 0) {
        engine.placeWord(entry, placement);
        break;
      }
    }
  }

  for (const entry of queue) {
    if (engine.placedWords.some((word) => word.word === entry.word)) {
      continue;
    }
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
    wordsWithOnlyOneIntersection * 5
  );
}

export function generateCrossword(words, size = 10) {
  const prepared = prepareWords(words);

  if (prepared.length === 0) {
    throw new Error("No valid words found.");
  }

  let bestEngine = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const generations = 40;

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
