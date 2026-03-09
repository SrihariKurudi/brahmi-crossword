export const SHEET_EDIT_URL =
  "https://docs.google.com/spreadsheets/d/12IcDFnFLIz8HWWttG6B9UfrlmzMfZDs_Ba7le3n5y18/edit";

export const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/12IcDFnFLIz8HWWttG6B9UfrlmzMfZDs_Ba7le3n5y18/export?format=csv";

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

  if (wordIndex === -1 || clueIndex === -1) {
    throw new Error('CSV must include "word" and "clue" headers.');
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const word = (cols[wordIndex] || "").trim();
    const clue = (cols[clueIndex] || "").trim();

    if (!word) {
      continue;
    }
    rows.push({ word, clue });
  }

  return rows;
}

export async function fetchSheetTerms(csvUrl = SHEET_CSV_URL) {
  const response = await fetch(csvUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load sheet CSV (${response.status}).`);
  }
  const csvText = await response.text();
  return parseCsv(csvText);
}
