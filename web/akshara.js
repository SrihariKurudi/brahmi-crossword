const DEVANAGARI_START = 0x0900;
const DEVANAGARI_END = 0x097f;

const VIRAMA = "\u094d";
const NUKTA = "\u093c";

const INDEPENDENT_VOWELS = new Set(
  Array.from({ length: 0x0915 - 0x0904 }, (_, i) => String.fromCodePoint(0x0904 + i))
);

const CONSONANTS = new Set([
  ...Array.from({ length: 0x093a - 0x0915 }, (_, i) => String.fromCodePoint(0x0915 + i)),
  ...Array.from({ length: 0x0960 - 0x0958 }, (_, i) => String.fromCodePoint(0x0958 + i)),
]);

const VOWEL_SIGNS = new Set([
  "\u093a",
  "\u093b",
  "\u093e",
  "\u093f",
  "\u0940",
  "\u0941",
  "\u0942",
  "\u0943",
  "\u0944",
  "\u0945",
  "\u0946",
  "\u0947",
  "\u0948",
  "\u0949",
  "\u094a",
  "\u094b",
  "\u094c",
  "\u094e",
  "\u094f",
  "\u0962",
  "\u0963",
]);

const ENDING_MARKS = new Set(["\u0901", "\u0902", "\u0903"]);
const COMBINING_MARKS = new Set([...VOWEL_SIGNS, ...ENDING_MARKS, "\u0951", "\u0952"]);

function isDevanagari(ch) {
  if (!ch) {
    return false;
  }
  const cp = ch.codePointAt(0);
  return cp >= DEVANAGARI_START && cp <= DEVANAGARI_END;
}

function isConsonant(ch) {
  return CONSONANTS.has(ch);
}

export function splitAksharas(word) {
  const text = (word || "").trim();
  if (!text) {
    return [];
  }

  const chars = Array.from(text);
  const result = [];
  let i = 0;

  while (i < chars.length) {
    const ch = chars[i];

    if (/\s/u.test(ch)) {
      i += 1;
      continue;
    }

    if (!isDevanagari(ch)) {
      result.push(ch);
      i += 1;
      continue;
    }

    if (INDEPENDENT_VOWELS.has(ch)) {
      const cluster = [ch];
      i += 1;
      while (i < chars.length && COMBINING_MARKS.has(chars[i])) {
        cluster.push(chars[i]);
        i += 1;
      }
      result.push(cluster.join(""));
      continue;
    }

    if (isConsonant(ch)) {
      const cluster = [ch];
      i += 1;

      if (i < chars.length && chars[i] === NUKTA) {
        cluster.push(chars[i]);
        i += 1;
      }

      while (i + 1 < chars.length && chars[i] === VIRAMA && isConsonant(chars[i + 1])) {
        cluster.push(chars[i], chars[i + 1]);
        i += 2;
        if (i < chars.length && chars[i] === NUKTA) {
          cluster.push(chars[i]);
          i += 1;
        }
      }

      while (i < chars.length && COMBINING_MARKS.has(chars[i])) {
        cluster.push(chars[i]);
        i += 1;
      }

      result.push(cluster.join(""));
      continue;
    }

    result.push(ch);
    i += 1;
  }

  return result;
}
