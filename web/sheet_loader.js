export const SHEET_EDIT_URL =
  "https://docs.google.com/spreadsheets/d/12IcDFnFLIz8HWWttG6B9UfrlmzMfZDs_Ba7le3n5y18/edit";

export const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/12IcDFnFLIz8HWWttG6B9UfrlmzMfZDs_Ba7le3n5y18/export?format=csv";

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  fields.push(current);
  return fields;
}

export function parseCsv(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const wordIndex = header.indexOf("word");
  const clueIndex = header.indexOf("clue");
  const tagIndex = header.indexOf("tag");
  const usedInMagIndex = header.indexOf("used_in_mag");

  if (wordIndex === -1 || clueIndex === -1) {
    throw new Error('CSV must include "word" and "clue" headers.');
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const word = (cols[wordIndex] || "").trim();
    const clue = (cols[clueIndex] || "").trim();
    const tag = tagIndex === -1 ? "" : (cols[tagIndex] || "").trim();
    const usedInMag = usedInMagIndex === -1 ? "" : (cols[usedInMagIndex] || "").trim();

    if (!word) {
      continue;
    }
    rows.push({ word, clue, tag, usedInMag });
  }

  return rows;
}

function enforceConsecutiveTagLimit(entries, maxConsecutive = 3) {
  if (entries.length <= maxConsecutive) {
    return entries;
  }

  const list = entries.slice();
  let streakTag = "";
  let streakCount = 0;

  for (let i = 0; i < list.length; i += 1) {
    const tag = list[i].tag || "__untagged__";
    if (tag === streakTag) {
      streakCount += 1;
    } else {
      streakTag = tag;
      streakCount = 1;
    }

    if (streakCount <= maxConsecutive) {
      continue;
    }

    let swapIndex = -1;
    for (let j = i + 1; j < list.length; j += 1) {
      const nextTag = list[j].tag || "__untagged__";
      if (nextTag !== streakTag) {
        swapIndex = j;
        break;
      }
    }

    if (swapIndex === -1) {
      continue;
    }

    [list[i], list[swapIndex]] = [list[swapIndex], list[i]];
    streakTag = list[i].tag || "__untagged__";
    streakCount = 1;
  }

  return list;
}

function diversifyByTag(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = (entry.tag || "").trim() || "__untagged__";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(entry);
  }

  const tags = shuffle(Array.from(groups.keys()));
  for (const tag of tags) {
    groups.set(tag, shuffle(groups.get(tag)));
  }

  const diversified = [];
  let remaining = entries.length;
  let cursor = 0;

  while (remaining > 0) {
    const tag = tags[cursor % tags.length];
    const bucket = groups.get(tag);
    if (bucket.length > 0) {
      diversified.push(bucket.pop());
      remaining -= 1;
    }
    cursor += 1;
  }

  return enforceConsecutiveTagLimit(diversified, 3);
}

export async function fetchSheetTerms(csvUrl = SHEET_CSV_URL) {
  const response = await fetch(csvUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load sheet CSV (${response.status}).`);
  }
  const csvText = await response.text();
  const rows = parseCsv(csvText);
  const unused = rows.filter((row) => !row.usedInMag);
  return diversifyByTag(unused);
}
