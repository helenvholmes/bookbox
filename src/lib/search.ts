/**
 * Library search, shared by the server (the ?q= results) and the browser (instant results and
 * offline search), so both find the same books. Accents and punctuation are ignored, words match
 * by prefix ("gaim" finds Gaiman), and names and titles forgive a typo or two ("pirenesi").
 */

export type SearchEntry = {
  id: number;
  title: string;
  author: string;
  authorOriginal: string;
  additionalAuthors: string;
  series: string;
  tags: string;
  isbn: string;
  cover: string | null;
  rating: number | null;
  shelf: string;
  year: number | null;
  /** Review, quotes and private notes: matched exactly, never fuzzily. */
  text: string;
};

export type SearchHit = { entry: SearchEntry; score: number; field: MatchField };
export type MatchField = "title" | "author" | "series" | "tags" | "isbn" | "text";

type Field = { name: MatchField; weight: number; fuzzy: boolean; get: (e: SearchEntry) => string };

const FIELDS: Field[] = [
  { name: "title", weight: 10, fuzzy: true, get: (e) => e.title },
  { name: "author", weight: 8, fuzzy: true, get: (e) => `${e.author} ${e.authorOriginal}` },
  { name: "series", weight: 6, fuzzy: true, get: (e) => e.series },
  { name: "author", weight: 4, fuzzy: true, get: (e) => e.additionalAuthors },
  { name: "tags", weight: 3, fuzzy: false, get: (e) => e.tags },
  { name: "text", weight: 1, fuzzy: false, get: (e) => e.text },
];

/** Lowercase, strip accents, and turn anything that isn't a letter or digit into a space. */
export function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

type Prepared = { entry: SearchEntry; fields: { field: Field; text: string; words: string[] }[]; isbn: string };

const prepared = new WeakMap<SearchEntry[], Prepared[]>();

function prepare(entries: SearchEntry[]): Prepared[] {
  let p = prepared.get(entries);
  if (!p) {
    p = entries.map((entry) => ({
      entry,
      isbn: entry.isbn.replace(/\D/g, ""),
      fields: FIELDS.map((field) => {
        const text = fold(field.get(entry));
        return { field, text, words: text ? text.split(" ") : [] };
      }),
    }));
    prepared.set(entries, p);
  }
  return p;
}

/** Edit distance with transpositions, giving up once it exceeds `max`. */
function withinDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return false;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length] <= max;
}

// Short words only get a typo allowance when nothing matched without one ("crek" finds Creek, but "gaim" doesn't find "gain" next to Gaiman).
const typoBudget = (token: string, loose: boolean) => (token.length >= 8 ? 2 : token.length >= (loose ? 4 : 5) ? 1 : 0);

/** How well one query word matches one field, from 0 (not at all) to 3 (a whole word). */
function tokenScore(token: string, text: string, words: string[], fuzzy: boolean, loose: boolean): number {
  if (!text) return 0;
  let best = 0;
  for (const w of words) {
    if (w === token) return 3;
    if (w.startsWith(token)) best = Math.max(best, 2);
  }
  if (best) return best;
  // Mid-word matches for longer fragments, and for scripts written without spaces.
  if ((token.length >= 3 || /[^\p{Script=Latin}\p{N}]/u.test(token)) && text.includes(token)) return 1;
  const budget = fuzzy ? typoBudget(token, loose) : 0;
  if (budget) {
    for (const w of words) {
      // Compare against the whole word, and against its start so a misspelt prefix still finds it.
      if (w.length >= 3 && (withinDistance(token, w, budget) || (w.length > token.length && withinDistance(token, w.slice(0, token.length), budget)))) {
        return 0.75;
      }
    }
  }
  return 0;
}

/** Books matching every word of the query, best matches first. */
export function searchBooks(entries: SearchEntry[], query: string): SearchHit[] {
  const hits = match(entries, query, false);
  return hits.length ? hits : match(entries, query, true);
}

function match(entries: SearchEntry[], query: string, loose: boolean): SearchHit[] {
  const q = fold(query);
  if (!q) return [];
  const tokens = [...new Set(q.split(" "))];
  const digits = query.replace(/[\s-]/g, "");
  const isbnQuery = /^\d{5,13}[\dx]?$/i.test(digits) ? digits.replace(/x$/i, "") : null;

  const hits: SearchHit[] = [];
  for (const p of prepare(entries)) {
    if (isbnQuery && p.isbn.includes(isbnQuery)) {
      hits.push({ entry: p.entry, score: 100, field: "isbn" });
      continue;
    }
    let score = 0;
    let field: MatchField = "title";
    let bestFieldScore = 0;
    let all = true;
    for (const token of tokens) {
      let tokenBest = 0;
      for (const f of p.fields) {
        const s = tokenScore(token, f.text, f.words, f.field.fuzzy, loose) * f.field.weight;
        if (s > tokenBest) tokenBest = s;
        if (s > bestFieldScore) {
          bestFieldScore = s;
          field = f.field.name;
        }
      }
      if (!tokenBest) {
        all = false;
        break;
      }
      score += tokenBest;
    }
    if (!all) continue;
    // A title that starts with the query beats one that merely contains it.
    if (p.fields[0].text.startsWith(q)) score += 15;
    hits.push({ entry: p.entry, score, field });
  }
  return hits.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
}
