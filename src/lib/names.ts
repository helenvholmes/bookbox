const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "phd", "md"]);
const PARTICLES = new Set(["de", "da", "di", "du", "del", "della", "der", "den", "la", "le", "van", "von", "st.", "bin", "ibn", "al"]);

/**
 * "Robert Jackson Bennett" -> "Bennett, Robert Jackson"
 * "Ursula K. Le Guin"      -> "Le Guin, Ursula K."
 * "Martin Luther King Jr." -> "King, Martin Luther, Jr."
 */
export function authorSort(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.includes(",")) return cleaned;

  const words = cleaned.split(" ");
  let suffix = "";
  if (words.length > 2 && SUFFIXES.has(words[words.length - 1].toLowerCase().replace(/,$/, ""))) {
    suffix = words.pop()!;
  }
  if (words.length < 2) return cleaned;

  let lastStart = words.length - 1;
  while (lastStart > 1 && PARTICLES.has(words[lastStart - 1].toLowerCase())) lastStart--;

  const last = words.slice(lastStart).join(" ");
  const first = words.slice(0, lastStart).join(" ");
  return suffix ? `${last}, ${first}, ${suffix}` : `${last}, ${first}`;
}

/** Normalises an ISBN-10 or ISBN-13 to ISBN-13. Returns null when it isn't a valid ISBN. */
export function toIsbn13(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
  // Spreadsheets drop leading zeros from ISBN-10s stored as numbers.
  if (s.length === 9) s = "0" + s;
  if (s.length === 10) {
    if (!isValidIsbn10(s)) return null;
    const core = "978" + s.slice(0, 9);
    return core + isbn13CheckDigit(core);
  }
  if (s.length === 13 && /^\d+$/.test(s) && isbn13CheckDigit(s.slice(0, 12)) === s[12]) return s;
  return null;
}

function isValidIsbn10(s: string): boolean {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (s[i] === "X" ? 10 : Number(s[i])) * (10 - i);
  return sum % 11 === 0;
}

function isbn13CheckDigit(core12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

export function looksLikeIsbn(q: string): boolean {
  return /^[\d\-\sXx]{9,17}$/.test(q.trim()) && toIsbn13(q) !== null;
}
