import "server-only";
import { connection } from "next/server";
import { SOURCE_URL } from "./constants";
import { db, transaction } from "./db";

/**
 * Who wrote the books you read, by gender, for Stats. Each author (as written on a book's author
 * line; co-authors aren't counted) is looked up on Wikidata, which records gender for many
 * published authors, and you can set or correct any of them on the Authors page. What you set is
 * never overwritten by a lookup.
 *
 * Wikidata is only trusted when it's sure: a person with that exact name (or alias) who is listed as
 * a writer of some kind or has an Open Library author ID, and when every such person agrees.
 * Otherwise the author stays "not known" for you to set.
 */

export const GENDERS = ["woman", "man", "nonbinary"] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABELS: Record<Gender, string> = { woman: "Women", man: "Men", nonbinary: "Nonbinary" };

export type Breakdown = Record<Gender | "unknown", number> & { total: number };

/** Books read (each once, however often re-read), by their author's gender: all time, or in one year. */
export async function genderBreakdown(year?: number): Promise<Breakdown> {
  const rows = (await db
    .prepare(
      // g.name on the left so the comparison uses its NOCASE collation.
      `SELECT g.gender, count(*) AS n
       FROM (SELECT DISTINCT b.id, trim(b.author) AS author FROM book_reads r JOIN books b ON b.id = r.book_id ${year ? "WHERE r.year = ?" : ""}) x
       LEFT JOIN author_genders g ON g.name = x.author
       GROUP BY g.gender`,
    )
    .all(...(year ? [year] : []))) as { gender: Gender | null; n: number }[];
  const out: Breakdown = { woman: 0, man: 0, nonbinary: 0, unknown: 0, total: 0 };
  for (const r of rows) {
    out[r.gender ?? "unknown"] += r.n;
    out.total += r.n;
  }
  return out;
}

/** The same split for every year with books read, newest first. */
export async function genderByYear(): Promise<{ year: number; breakdown: Breakdown }[]> {
  const rows = (await db
    .prepare(
      `SELECT x.year, g.gender, count(*) AS n
       FROM (SELECT DISTINCT r.year, b.id, trim(b.author) AS author FROM book_reads r JOIN books b ON b.id = r.book_id) x
       LEFT JOIN author_genders g ON g.name = x.author
       GROUP BY x.year, g.gender`,
    )
    .all()) as { year: number; gender: Gender | null; n: number }[];
  const byYear = new Map<number, Breakdown>();
  for (const r of rows) {
    const b = byYear.get(r.year) ?? { woman: 0, man: 0, nonbinary: 0, unknown: 0, total: 0 };
    b[r.gender ?? "unknown"] += r.n;
    b.total += r.n;
    byYear.set(r.year, b);
  }
  return [...byYear].sort((a, b) => b[0] - a[0]).map(([year, breakdown]) => ({ year, breakdown }));
}

export type AuthorRow = { name: string; books: number; read: number; gender: Gender | null; source: "wikidata" | "you" | null; wikidataId: string | null };

/** Every author in your library, with what's known of them; most-read first. */
export async function listAuthors(): Promise<AuthorRow[]> {
  await connection();
  const rows = (await db
    .prepare(
      `SELECT a.name, a.books, a.read, g.gender, g.source, g.wikidata_id AS wikidataId
       FROM (SELECT trim(author) AS name, count(*) AS books,
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM book_reads r WHERE r.book_id = books.id)) AS read
             FROM books WHERE trim(author) != '' GROUP BY trim(author) COLLATE NOCASE) a
       LEFT JOIN author_genders g ON g.name = a.name
       ORDER BY a.read DESC, a.books DESC, a.name`,
    )
    .all()) as AuthorRow[];
  return rows;
}

/** Authors not looked up yet (and not set by you). */
export async function countUnchecked(): Promise<number> {
  return ((await db
    .prepare(
      `SELECT count(DISTINCT trim(author) COLLATE NOCASE) AS n FROM books b
       WHERE trim(author) != '' AND NOT EXISTS (SELECT 1 FROM author_genders g WHERE g.name = trim(b.author))`,
    )
    .get()) as { n: number }).n;
}

/** Sets an author's gender yourself (null: not known). Lookups leave it alone from then on. */
export async function setAuthorGender(name: string, gender: Gender | null) {
  await db
    .prepare(
      `INSERT INTO author_genders (name, gender, source, wikidata_id, checked_at) VALUES (?, ?, 'you', NULL, datetime('now'))
       ON CONFLICT(name) DO UPDATE SET gender = excluded.gender, source = 'you', wikidata_id = NULL, checked_at = excluded.checked_at`,
    )
    .run(name, gender);
}

/** Looks up the next few authors that haven't been, on Wikidata. Returns how many are left after these. */
export async function lookUpNextAuthors(batch = 50): Promise<{ checked: number; found: number; remaining: number }> {
  const names = ((await db
    .prepare(
      `SELECT DISTINCT trim(author) AS name FROM books b
       WHERE trim(author) != '' AND NOT EXISTS (SELECT 1 FROM author_genders g WHERE g.name = trim(b.author))
       GROUP BY trim(author) COLLATE NOCASE ORDER BY max(b.id) DESC LIMIT ?`,
    )
    .all(batch)) as { name: string }[]).map((r) => r.name);
  if (!names.length) return { checked: 0, found: 0, remaining: 0 };
  const found = await wikidataGenders(names);
  await transaction(async () => {
    for (const name of names) {
      const hit = found.get(name);
      // INSERT OR IGNORE: something you set meanwhile wins.
      await db
        .prepare("INSERT OR IGNORE INTO author_genders (name, gender, source, wikidata_id) VALUES (?, ?, 'wikidata', ?)")
        .run(name, hit?.gender ?? null, hit?.id ?? null);
    }
  });
  return { checked: names.length, found: [...found.values()].length, remaining: await countUnchecked() };
}

/** Wikidata's sex or gender (P21) values, grouped as the stats show them. Anything else stays not known. */
const GENDER_ITEMS: Record<string, Gender> = {
  Q6581072: "woman", // female
  Q1052281: "woman", // trans woman
  Q6581097: "man", // male
  Q2449503: "man", // trans man
  Q48270: "nonbinary", // non-binary
  Q12964198: "nonbinary", // genderqueer
  Q18116794: "nonbinary", // genderfluid
  Q1289754: "nonbinary", // agender
  Q301702: "nonbinary", // two-spirit
};

/** Occupations (P106) that make a namesake count as the author: writer, novelist, poet and so on. */
const WRITERS = [
  "Q36180", // writer
  "Q482980", // author
  "Q6625963", // novelist
  "Q49757", // poet
  "Q11774202", // essayist
  "Q1930187", // journalist
  "Q201788", // historian
  "Q4853732", // children's writer
  "Q18844224", // science fiction writer
  "Q15980158", // non-fiction writer
  "Q28389", // screenwriter
  "Q214917", // playwright
  "Q1607826", // editor
  "Q4964182", // philosopher
  "Q3745071", // science writer
];

const SPARQL = "https://query.wikidata.org/sparql";
const literal = (s: string) => JSON.stringify(s); // a SPARQL string literal: the same escaping as JSON

/** Looks names up on Wikidata, in one query. Returns the ones it's sure of. */
async function wikidataGenders(names: string[]): Promise<Map<string, { gender: Gender; id: string }>> {
  // Person names are increasingly labelled in "mul" (all languages) rather than English.
  const values = names.flatMap((n) => [`${literal(n)}@en`, `${literal(n)}@mul`]).join(" ");
  const query = `SELECT DISTINCT ?name ?p ?g ?ol ?writer WHERE {
    VALUES ?name { ${values} }
    ?p rdfs:label|skos:altLabel ?name ; wdt:P31 wd:Q5 ; wdt:P21 ?g .
    OPTIONAL { ?p wdt:P648 ?ol }
    OPTIONAL { ?p wdt:P106 ?occ . VALUES ?occ { ${WRITERS.map((q) => `wd:${q}`).join(" ")} } BIND(true AS ?writer) }
  }`;
  const res = await fetch(SPARQL, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      // Wikidata asks for a User-Agent that says who's asking.
      "User-Agent": `BookBox/1.0 (personal reading log; ${SOURCE_URL})`,
    },
    body: new URLSearchParams({ query }),
    cache: "no-store",
    signal: AbortSignal.timeout(50_000),
  });
  if (!res.ok) throw new Error(`Wikidata answered ${res.status}`);
  const json = (await res.json()) as {
    results: { bindings: Record<string, { value: string } | undefined>[] };
  };

  // Per name: each person who's plausibly the author, and the genders Wikidata gives them.
  const people = new Map<string, Map<string, Set<Gender | null>>>();
  for (const b of json.results.bindings) {
    if (!b.ol && !b.writer) continue;
    const name = b.name!.value;
    const id = b.p!.value.split("/").pop()!;
    const gender = GENDER_ITEMS[b.g!.value.split("/").pop()!] ?? null;
    const byPerson = people.get(name) ?? new Map<string, Set<Gender | null>>();
    byPerson.set(id, (byPerson.get(id) ?? new Set()).add(gender));
    people.set(name, byPerson);
  }

  const out = new Map<string, { gender: Gender; id: string }>();
  for (const name of names) {
    const byPerson = people.get(name);
    if (!byPerson) continue;
    const genders = new Set([...byPerson.values()].flatMap((g) => [...g]));
    // Sure only when every namesake agrees on one gender we show.
    const [only] = genders;
    if (genders.size === 1 && only) out.set(name, { gender: only, id: [...byPerson.keys()][0] });
  }
  return out;
}
