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
    this.nextWordId = 1;
    this.tagCounts = new Map();
    this.totalIntersections = 0;
    this.wordDegrees = new Map();
    this.danglingWords = 0;
    this.averageWordDegree = 0;
    this.emptyCells = size * size;
    this.tagScore = 0;
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

  maxTagCountForTotal(totalWords) {
    return totalWords < 3 ? 1 : Math.ceil(totalWords / 3);
  }

  wouldViolateTagConstraint(tag, totalWords = this.placedWords.length + 1) {
    if (!tag) {
      return false;
    }

    const nextCount = (this.tagCounts.get(tag) || 0) + 1;
    return nextCount > this.maxTagCountForTotal(totalWords);
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
    const intersectedWordIds = new Set();
    let currentRun = 0;
    let longestRun = 0;

    for (let i = 0; i < length; i += 1) {
      const r = row + dr * i;
      const c = col + dc * i;
      const existing = this.grid[r][c];
      const ak = aksharas[i];

      if (existing !== null) {
        if (existing.solution !== ak) {
          return null;
        }
        for (const ownerId of existing.owners || []) {
          const ownerWord = this.placedWords.find((word) => word.id === ownerId);
          if (ownerWord?.direction === direction) {
            return null;
          }
        }
        intersections += 1;
        longestRun = Math.max(longestRun, currentRun);
        currentRun = 0;
        for (const ownerId of existing.owners || []) {
          intersectedWordIds.add(ownerId);
        }
      } else if (!this.adjacentOk(r, c, direction)) {
        return null;
      } else {
        emptyCellsCreated += 1;
        currentRun += 1;
      }
    }

    longestRun = Math.max(longestRun, currentRun);

    if (
      this.placedWords.length > 0 &&
      intersections === 0
    ) {
      return null;
    }

    const longRunThreshold = Math.max(3, Math.ceil(length * 0.6));
    if (this.placedWords.length > 0 && intersections < 2 && longestRun >= longRunThreshold) {
      return null;
    }

    return {
      row,
      col,
      direction,
      uniqueWordsIntersected: intersectedWordIds.size,
      intersectionsCreated: intersections,
      emptyCellsCreated,
      longestNonIntersectingStretch: longestRun,
    };
  }

  tagDiversityContribution(entry) {
    const tag = clean(entry.tag);
    if (!tag) {
      return 0;
    }

    const currentCount = this.tagCounts.get(tag) || 0;
    if (currentCount === 0) {
      return 1;
    }

    let minCount = currentCount;
    for (const count of this.tagCounts.values()) {
      minCount = Math.min(minCount, count);
    }

    return currentCount === minCount ? 0.5 : 0;
  }

  scorePlacement(entry, placement) {
    if (this.wouldViolateTagConstraint(clean(entry.tag))) {
      return null;
    }

    const tagContribution = this.tagDiversityContribution(entry);
    const longRunPenalty = placement.longestNonIntersectingStretch >= 4 ? 2 : 0;
    return {
      ...placement,
      tagDiversityContribution: tagContribution,
      placementScore:
        placement.intersectionsCreated * 6 +
        placement.uniqueWordsIntersected * 4 +
        tagContribution * 2 -
        placement.emptyCellsCreated -
        longRunPenalty,
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
      .map((candidate) => this.scorePlacement(entry, candidate))
      .filter(Boolean);

    if (scored.length === 0) {
      return null;
    }

    const bridgePool = scored.filter((candidate) => candidate.uniqueWordsIntersected >= 2);
    const densePool = scored.filter((candidate) => candidate.intersectionsCreated >= 2);
    const pool = bridgePool.length > 0 ? bridgePool : densePool.length > 0 ? densePool : scored;
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
      entry,
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
    const tag = clean(entry.tag);
    if (tag) {
      this.tagCounts.set(tag, (this.tagCounts.get(tag) || 0) + 1);
    }
  }

  recalculateStats() {
    const wordDegrees = new Map(this.placedWords.map((word) => [word.id, new Set()]));
    let totalIntersections = 0;
    let occupied = 0;
    let minRow = this.size;
    let minCol = this.size;
    let maxRow = -1;
    let maxCol = -1;

    for (let r = 0; r < this.size; r += 1) {
      for (let c = 0; c < this.size; c += 1) {
        const cell = this.grid[r][c];
        if (!cell) {
          continue;
        }

        occupied += 1;
        minRow = Math.min(minRow, r);
        minCol = Math.min(minCol, c);
        maxRow = Math.max(maxRow, r);
        maxCol = Math.max(maxCol, c);

        if ((cell.owners || []).length > 1) {
          totalIntersections += 1;
          for (let i = 0; i < cell.owners.length; i += 1) {
            for (let j = i + 1; j < cell.owners.length; j += 1) {
              wordDegrees.get(cell.owners[i])?.add(cell.owners[j]);
              wordDegrees.get(cell.owners[j])?.add(cell.owners[i]);
            }
          }
        }
      }
    }

    for (const word of this.placedWords) {
      const degree = wordDegrees.get(word.id)?.size || 0;
      word.intersections = degree;
      word.intersectionWords = degree;
    }

    const danglingWords = this.placedWords.filter((word) => word.intersections === 1).length;
    const degreeSum = this.placedWords.reduce((sum, word) => sum + word.intersections, 0);
    const averageWordDegree = this.placedWords.length > 0 ? degreeSum / this.placedWords.length : 0;

    const uniqueTags = new Set(
      this.placedWords.map((word) => clean(word.tag)).filter((tag) => tag.length > 0)
    ).size;
    const tagScore = this.placedWords.length > 0 ? uniqueTags / this.placedWords.length : 0;

    const boundingEmptyCells = maxRow < 0
      ? this.size * this.size
      : (maxRow - minRow + 1) * (maxCol - minCol + 1) - occupied;

    this.wordDegrees = new Map(Array.from(wordDegrees.entries(), ([id, set]) => [id, set.size]));
    this.totalIntersections = totalIntersections;
    this.danglingWords = danglingWords;
    this.averageWordDegree = averageWordDegree;
    this.emptyCells = boundingEmptyCells;
    this.tagScore = tagScore;
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
      used_in_mag: clean(entry.used_in_mag),
      aksharas: splitAksharas(clean(entry.word)),
    }))
    .filter((entry) => entry.word && entry.aksharas.length > 0 && !entry.used_in_mag);

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

function rankEntriesForPlacement(entries, engine) {
  return shuffle(entries.slice()).sort((a, b) => {
    const tagA = engine.tagCounts.get(clean(a.tag)) || 0;
    const tagB = engine.tagCounts.get(clean(b.tag)) || 0;
    if (tagA !== tagB) {
      return tagA - tagB;
    }
    return b.intersectionPotential - a.intersectionPotential;
  });
}

function chooseNextPlacement(engine, entries, sampleSize = 12) {
  const ranked = rankEntriesForPlacement(entries, engine);
  for (let offset = 0; offset < ranked.length; offset += sampleSize) {
    const sample = ranked.slice(offset, offset + sampleSize);
    let best = null;

    for (const entry of sample) {
      const placement = engine.bestPlacement(entry);
      if (!placement) {
        continue;
      }
      if (!best || placement.placementScore > best.placement.placementScore) {
        best = { entry, placement };
      }
    }

    if (best) {
      return best;
    }
  }

  return null;
}

function layoutScore(engine) {
  engine.recalculateStats();

  let tagPenalty = 0;
  for (const [, count] of engine.tagCounts) {
    if (count > engine.maxTagCountForTotal(engine.placedWords.length)) {
      tagPenalty += (count - engine.maxTagCountForTotal(engine.placedWords.length)) * 10;
    }
  }

  return (
    engine.totalIntersections * 5 +
    engine.averageWordDegree * 3 +
    engine.tagScore * 3 +
    engine.placedWords.length * 2 -
    engine.emptyCells -
    engine.danglingWords -
    tagPenalty
  );
}

function serializePlacements(engine) {
  return engine.placedWords.map((word) => ({
    entry: word.entry,
    row: word.row,
    col: word.col,
    direction: word.direction,
  }));
}

function buildEngineFromPlacements(size, placements) {
  const engine = new CrosswordEngine(size);
  for (const placement of placements) {
    const validated = engine.analyzePlacement(
      placement.entry.aksharas,
      placement.row,
      placement.col,
      placement.direction
    );
    if (!validated && engine.placedWords.length > 0) {
      return null;
    }
    engine.placeWord(placement.entry, validated || placement);
  }

  engine.assignNumbers();
  engine.recalculateStats();
  return engine;
}

function greedilyAddWords(engine, prepared, timeLimitMs = Number.POSITIVE_INFINITY, startTime = 0) {
  let progress = true;

  while (progress) {
    if (performance.now() - startTime > timeLimitMs) {
      break;
    }

    progress = false;
    const used = new Set(engine.placedWords.map((word) => word.word));
    const remaining = prepared.filter((entry) => !used.has(entry.word));
    const choice = chooseNextPlacement(engine, remaining);
    if (choice) {
      engine.placeWord(choice.entry, choice.placement);
      progress = true;
    }
  }
}

function generateSingleCrossword(prepared, size, startTime, budgetMs) {
  const engine = new CrosswordEngine(size);
  const seedPool = pickSeedCandidates(prepared);
  let first = null;
  let placement = null;

  for (const candidate of shuffle(seedPool)) {
    const seededPlacement = seedPlacement(size, candidate);
    if (engine.analyzePlacement(candidate.aksharas, seededPlacement.row, seededPlacement.col, seededPlacement.direction)) {
      first = candidate;
      placement = seededPlacement;
      break;
    }
  }

  if (!first || !placement) {
    throw new Error("Unable to place first word.");
  }

  engine.placeWord(first, placement);
  greedilyAddWords(engine, prepared, budgetMs, startTime);
  engine.assignNumbers();
  engine.recalculateStats();
  return engine;
}

function tryRelocation(engine, prepared) {
  if (engine.placedWords.length < 2) {
    return engine;
  }

  const placements = serializePlacements(engine);
  const target = placements[Math.floor(Math.random() * placements.length)];
  const basePlacements = placements.filter((placement) => placement !== target);
  const rebuilt = buildEngineFromPlacements(engine.size, basePlacements);
  if (!rebuilt) {
    return engine;
  }

  const newPlacement = rebuilt.bestPlacement(target.entry);
  if (!newPlacement) {
    return engine;
  }

  rebuilt.placeWord(target.entry, newPlacement);
  greedilyAddWords(rebuilt, prepared);
  rebuilt.assignNumbers();
  rebuilt.recalculateStats();
  return rebuilt;
}

function tryReplacement(engine, prepared) {
  if (engine.placedWords.length === 0) {
    return engine;
  }

  const placements = serializePlacements(engine);
  const used = new Set(placements.map((placement) => placement.entry.word));
  const target = placements[Math.floor(Math.random() * placements.length)];
  const candidates = rankEntriesForPlacement(
    prepared.filter((entry) => !used.has(entry.word) || entry.word === target.entry.word),
    engine
  ).filter((entry) => entry.word !== target.entry.word);

  if (candidates.length === 0) {
    return engine;
  }

  const basePlacements = placements.filter((placement) => placement !== target);
  const rebuilt = buildEngineFromPlacements(engine.size, basePlacements);
  if (!rebuilt) {
    return engine;
  }

  for (const candidate of candidates.slice(0, 10)) {
    const placement = rebuilt.bestPlacement(candidate);
    if (!placement) {
      continue;
    }
    rebuilt.placeWord(candidate, placement);
    greedilyAddWords(rebuilt, prepared);
    rebuilt.assignNumbers();
    rebuilt.recalculateStats();
    return rebuilt;
  }

  return engine;
}

function tryMicroShift(engine) {
  if (engine.placedWords.length === 0) {
    return engine;
  }

  const placements = serializePlacements(engine);
  const target = placements[Math.floor(Math.random() * placements.length)];
  const basePlacements = placements.filter((placement) => placement !== target);
  const rebuilt = buildEngineFromPlacements(engine.size, basePlacements);
  if (!rebuilt) {
    return engine;
  }

  const deltas = shuffle([
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ]);

  let best = null;
  for (const delta of deltas) {
    const candidate = rebuilt.analyzePlacement(
      target.entry.aksharas,
      target.row + delta.row,
      target.col + delta.col,
      target.direction
    );
    if (!candidate) {
      continue;
    }
    const scored = rebuilt.scorePlacement(target.entry, candidate);
    if (scored && (!best || scored.placementScore > best.placementScore)) {
      best = scored;
    }
  }

  if (!best) {
    return engine;
  }

  rebuilt.placeWord(target.entry, best);
  rebuilt.assignNumbers();
  rebuilt.recalculateStats();
  return rebuilt;
}

function optimizeLayout(initialEngine, prepared, startTime, budgetMs) {
  let current = initialEngine;
  let currentScore = layoutScore(current);
  let best = current;
  let bestScore = currentScore;
  let stagnantIterations = 0;

  for (let iteration = 0; iteration < 100; iteration += 1) {
    if (stagnantIterations >= 30 || performance.now() - startTime > budgetMs) {
      break;
    }

    const roll = Math.random();
    const mutated = roll < 0.4
      ? tryRelocation(current, prepared)
      : roll < 0.75
        ? tryReplacement(current, prepared)
        : tryMicroShift(current);
    const mutatedScore = layoutScore(mutated);

    if (mutatedScore > currentScore || Math.random() < 0.05) {
      current = mutated;
      currentScore = mutatedScore;
    }

    if (currentScore > bestScore) {
      best = current;
      bestScore = currentScore;
      stagnantIterations = 0;
    } else {
      stagnantIterations += 1;
    }
  }

  best.assignNumbers();
  best.recalculateStats();
  return best;
}

export function generateCrossword(words, size = 10) {
  const prepared = prepareWords(words);

  if (prepared.length === 0) {
    throw new Error("No valid words found.");
  }

  let bestEngine = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const startedAt = performance.now();
  const generations = 20;
  const budgetMs = 180;

  for (let i = 0; i < generations; i += 1) {
    if (performance.now() - startedAt > budgetMs) {
      break;
    }

    const engine = optimizeLayout(
      generateSingleCrossword(prepared, size, startedAt, budgetMs),
      prepared,
      startedAt,
      budgetMs
    );
    const score = layoutScore(engine);
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
