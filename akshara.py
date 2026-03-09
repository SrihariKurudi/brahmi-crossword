"""Utilities for splitting Sanskrit Devanagari words into aksharas."""

from __future__ import annotations

DEVANAGARI_START = 0x0900
DEVANAGARI_END = 0x097F

VIRAMA = "\u094d"
NUKTA = "\u093c"

INDEPENDENT_VOWELS = {chr(c) for c in range(0x0904, 0x0915)}
CONSONANTS = {chr(c) for c in range(0x0915, 0x093A)} | {chr(c) for c in range(0x0958, 0x0960)}
VOWEL_SIGNS = {
    "\u093a", "\u093b", "\u093e", "\u093f", "\u0940", "\u0941", "\u0942",
    "\u0943", "\u0944", "\u0945", "\u0946", "\u0947", "\u0948", "\u0949",
    "\u094a", "\u094b", "\u094c", "\u094e", "\u094f", "\u0962", "\u0963",
}
ENDING_MARKS = {"\u0901", "\u0902", "\u0903"}
COMBINING_MARKS = VOWEL_SIGNS | ENDING_MARKS | {"\u0951", "\u0952"}


def _is_devanagari(ch: str) -> bool:
    cp = ord(ch)
    return DEVANAGARI_START <= cp <= DEVANAGARI_END


def _is_consonant(ch: str) -> bool:
    return ch in CONSONANTS


def split_aksharas(word: str) -> list[str]:
    """Split a Devanagari word into akshara units.

    Akshara model used:
    - consonant cluster joined by virama
    - optional vowel sign
    - optional anusvara/visarga/chandrabindu

    Independent vowels are treated as standalone aksharas.
    """
    text = word.strip()
    if not text:
        return []

    result: list[str] = []
    i = 0
    n = len(text)

    while i < n:
        ch = text[i]

        if ch.isspace():
            i += 1
            continue

        if not _is_devanagari(ch):
            result.append(ch)
            i += 1
            continue

        if ch in INDEPENDENT_VOWELS:
            cluster = [ch]
            i += 1
            while i < n and text[i] in COMBINING_MARKS:
                cluster.append(text[i])
                i += 1
            result.append("".join(cluster))
            continue

        if _is_consonant(ch):
            cluster = [ch]
            i += 1

            if i < n and text[i] == NUKTA:
                cluster.append(text[i])
                i += 1

            while i + 1 < n and text[i] == VIRAMA and _is_consonant(text[i + 1]):
                cluster.append(text[i])
                cluster.append(text[i + 1])
                i += 2
                if i < n and text[i] == NUKTA:
                    cluster.append(text[i])
                    i += 1

            while i < n and text[i] in COMBINING_MARKS:
                cluster.append(text[i])
                i += 1

            result.append("".join(cluster))
            continue

        result.append(ch)
        i += 1

    return result


if __name__ == "__main__":
    samples = [
        "\u0939\u0943\u0926\u092f",  # hRdaya
        "\u092a\u094d\u0930\u0935\u093e\u0939",  # pravaha
        "\u0930\u0915\u094d\u0924",  # rakta
        "\u0915\u094d\u0937",  # ksha
        "\u0924\u094d\u0930",  # tra
        "\u091c\u094d\u091e",  # jna
    ]
    for sample in samples:
        print(sample, "->", split_aksharas(sample))
