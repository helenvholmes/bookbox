import "server-only";
import { connection } from "next/server";
import { db, transaction } from "./db";

export type DuplicateBook = {
  id: number;
  title: string;
  author: string;
  isbn13: string | null;
  cover: string | null;
  rating: number | null;
  years: number[];
  shelves: string[];
  hasReview: boolean;
  created_at: string;
};

export type DuplicateGroup = { reason: string; books: DuplicateBook[] };

/** "The Stranger (Vintage International, #3)" -> "stranger" */
function normalize(title: string) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*#\d+[^)]*\)/g, "") // series tags like "(Shades of Magic, #2)"
    .replace(/&/g, " and ")
    .replace(/^\s*(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitTitle(title: string) {
  const i = title.search(/[:(]/);
  return i === -1 ? { main: normalize(title), hasSubtitle: false } : { main: normalize(title.slice(0, i)), hasSubtitle: true };
}

/**
 * Groups books that share an ISBN or a title. A short title also matches the same title with a
 * subtitle ("Holistic Tarot" / "Holistic Tarot: An Integrative Approach…"), but two different
 * subtitles don't match, so series volumes stay apart.
 */
export async function findDuplicates(): Promise<DuplicateGroup[]> {
  await connection();
  const books = (
    (await db
      .prepare(
        `SELECT b.id, b.title, b.author, b.isbn13, b.cover, b.rating, b.created_at, b.review != '' AS hasReview,
           (SELECT group_concat(DISTINCT year) FROM book_reads WHERE book_id = b.id) AS years,
           (SELECT group_concat(s.name, '|') FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id WHERE bs.book_id = b.id) AS shelves
         FROM books b ORDER BY b.id`,
      )
      .all()) as (Omit<DuplicateBook, "years" | "shelves" | "hasReview"> & { years: string | null; shelves: string | null; hasReview: number })[]
  ).map((r) => ({
    ...r,
    hasReview: r.hasReview === 1,
    years: r.years ? r.years.split(",").map(Number).sort() : [],
    shelves: r.shelves ? r.shelves.split("|") : [],
  }));

  const dismissed = new Set(
    ((await db.prepare("SELECT book_a, book_b FROM not_duplicates").all()) as { book_a: number; book_b: number }[]).map((r) => `${r.book_a}-${r.book_b}`),
  );

  // Union-find over book ids, remembering why each pair matched.
  const parent = new Map<number, number>(books.map((b) => [b.id, b.id]));
  const find = (id: number): number => (parent.get(id) === id ? id : find(parent.get(id)!));
  const reasons = new Map<number, Set<string>>();
  function link(a: number, b: number, reason: string) {
    if (a === b || dismissed.has(a < b ? `${a}-${b}` : `${b}-${a}`)) return;
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent.set(rb, ra);
    const root = find(a);
    const set = new Set([...(reasons.get(ra) ?? []), ...(reasons.get(rb) ?? []), reason]);
    reasons.set(root, set);
  }

  const byKey = new Map<string, number>();
  const shortTitles = new Map<string, number>();
  const linkByKey = (key: string, id: number, reason: string) => {
    const first = byKey.get(key);
    if (first === undefined) byKey.set(key, id);
    else link(first, id, reason);
  };
  for (const b of books) {
    if (b.isbn13) linkByKey(`isbn:${b.isbn13}`, b.id, "Same ISBN");
    const full = normalize(b.title);
    if (full) linkByKey(`title:${full}`, b.id, "Same title");
    const { main, hasSubtitle } = splitTitle(b.title);
    if (main && !hasSubtitle && !shortTitles.has(main)) shortTitles.set(main, b.id);
  }
  for (const b of books) {
    const { main, hasSubtitle } = splitTitle(b.title);
    const short = hasSubtitle ? shortTitles.get(main) : undefined;
    if (short !== undefined) link(short, b.id, "Same title");
  }

  const groups = new Map<number, DuplicateBook[]>();
  for (const b of books) {
    const root = find(b.id);
    groups.set(root, [...(groups.get(root) ?? []), b]);
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([root, members]) => ({ reason: [...(reasons.get(root) ?? [])].sort().join(" · "), books: members }))
    .sort((a, b) => a.books[0].title.localeCompare(b.books[0].title));
}

export async function countDuplicates() {
  return (await findDuplicates()).length;
}

export async function markNotDuplicates(ids: number[]) {
  const insert = db.prepare("INSERT OR IGNORE INTO not_duplicates (book_a, book_b) VALUES (?, ?)");
  await transaction(async () => {
    for (const a of ids) for (const b of ids) if (a < b) (await insert.run(a, b));
  });
}
