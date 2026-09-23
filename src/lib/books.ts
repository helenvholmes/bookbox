import "server-only";
import { connection } from "next/server";
import { db, transaction } from "./db";
import { authorSort } from "./names";

export type Named = { id: number; name: string };

export type BookSummary = {
  id: number;
  title: string;
  author: string;
  cover: string | null;
  rating: number | null;
  years: number[];
  shelves: string[];
  /** Start of the description, for list rows. */
  blurb: string;
  tagIds: number[];
};

export type Book = BookSummary & {
  additional_authors: string;
  isbn13: string | null;
  description: string;
  review: string;
  spoiler: string;
  quotes: string;
  private_notes: string;
  on_kindle: boolean;
  owned: boolean;
  publisher: string;
  publish_year: number | null;
  pages: number | null;
  ol_work: string | null;
  ol_edition: string | null;
  tags: Named[];
  recommendedFor: Named[];
  recommendedBy: Named[];
};

export type Filters = {
  q?: string;
  shelf?: string;
  year?: string;
  tag?: string;
  person?: string;
  rating?: string;
  owned?: string;
  sort?: string;
};

export const SORTS = {
  recent: "Recently added",
  title: "Title",
  author: "Author",
  rating: "Rating",
  read: "Year read",
} as const;

const PERSON_NAME = "trim(p.first || ' ' || p.last)";

type Params = (string | number | null)[];

function summaryColumns() {
  return `b.id, b.title, b.author, b.cover, b.rating, substr(b.description, 1, 200) AS blurb,
    (SELECT group_concat(year, ',') FROM (SELECT year FROM book_years WHERE book_id = b.id ORDER BY year)) AS years,
    (SELECT group_concat(name, '|') FROM (SELECT s.name FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id
       WHERE bs.book_id = b.id ORDER BY s.position)) AS shelves,
    (SELECT group_concat(tag_id, ',') FROM book_tags WHERE book_id = b.id) AS tag_ids`;
}

type SummaryRow = Omit<BookSummary, "years" | "shelves" | "tagIds"> & { years: string | null; shelves: string | null; tag_ids: string | null };

function toSummary(r: SummaryRow): BookSummary {
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    cover: r.cover,
    rating: r.rating,
    years: r.years ? r.years.split(",").map(Number) : [],
    shelves: r.shelves ? r.shelves.split("|") : [],
    blurb: (r.blurb ?? "").replace(/\s+/g, " ").trim(),
    tagIds: r.tag_ids ? r.tag_ids.split(",").map(Number) : [],
  };
}

export async function listBooks(f: Filters): Promise<BookSummary[]> {
  await connection();
  const where: string[] = [];
  const params: Params = [];

  if (f.q?.trim()) {
    const like = `%${f.q.trim()}%`;
    where.push("(b.title LIKE ? OR b.author LIKE ? OR b.additional_authors LIKE ? OR b.isbn13 LIKE ?)");
    params.push(like, like, like, like);
  }
  if (f.shelf === "none") {
    where.push("NOT EXISTS (SELECT 1 FROM book_shelves bs WHERE bs.book_id = b.id)");
  } else if (f.shelf) {
    where.push("EXISTS (SELECT 1 FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id WHERE bs.book_id = b.id AND s.name = ?)");
    params.push(f.shelf);
  }
  if (f.year === "none") {
    where.push("NOT EXISTS (SELECT 1 FROM book_years y WHERE y.book_id = b.id)");
  } else if (f.year) {
    where.push("EXISTS (SELECT 1 FROM book_years y WHERE y.book_id = b.id AND y.year = ?)");
    params.push(Number(f.year));
  }
  if (f.tag) {
    where.push("EXISTS (SELECT 1 FROM book_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.book_id = b.id AND t.id = ?)");
    params.push(Number(f.tag));
  }
  if (f.person) {
    // "for:12" / "by:12"
    const [kind, id] = f.person.split(":");
    if ((kind === "for" || kind === "by") && Number(id)) {
      where.push("EXISTS (SELECT 1 FROM recommendations r WHERE r.book_id = b.id AND r.kind = ? AND r.person_id = ?)");
      params.push(kind, Number(id));
    }
  }
  if (f.rating === "none") where.push("b.rating IS NULL");
  else if (f.rating) {
    where.push("b.rating = ?");
    params.push(Number(f.rating));
  }
  if (f.owned === "owned") where.push("b.owned = 1");
  if (f.owned === "kindle") where.push("b.on_kindle = 1");

  const order =
    {
      title: "b.title COLLATE NOCASE",
      author: "b.author_sort COLLATE NOCASE, b.title COLLATE NOCASE",
      rating: "b.rating IS NULL, b.rating DESC, b.title COLLATE NOCASE",
      read: "(SELECT max(year) FROM book_years WHERE book_id = b.id) IS NULL, (SELECT max(year) FROM book_years WHERE book_id = b.id) DESC, b.id DESC",
    }[f.sort ?? ""] ?? "b.id DESC";

  const sql = `SELECT ${summaryColumns()} FROM books b ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order}`;
  return (db.prepare(sql).all(...params) as SummaryRow[]).map(toSummary);
}

export async function getBook(id: number): Promise<Book | null> {
  await connection();
  const row = db.prepare(`SELECT b.*, ${summaryColumns()} FROM books b WHERE b.id = ?`).get(id) as
    | (SummaryRow & Record<string, unknown>)
    | undefined;
  if (!row) return null;

  const tags = db
    .prepare("SELECT t.id, t.name FROM book_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.book_id = ? ORDER BY t.name")
    .all(id) as Named[];
  const recs = db
    .prepare(`SELECT p.id, ${PERSON_NAME} AS name, r.kind FROM recommendations r JOIN people p ON p.id = r.person_id
              WHERE r.book_id = ? ORDER BY p.first, p.last`)
    .all(id) as (Named & { kind: "for" | "by" })[];

  return {
    ...toSummary(row),
    additional_authors: row.additional_authors as string,
    isbn13: row.isbn13 as string | null,
    description: row.description as string,
    review: row.review as string,
    spoiler: row.spoiler as string,
    quotes: row.quotes as string,
    private_notes: row.private_notes as string,
    on_kindle: row.on_kindle === 1,
    owned: row.owned === 1,
    publisher: row.publisher as string,
    publish_year: row.publish_year as number | null,
    pages: row.pages as number | null,
    ol_work: row.ol_work as string | null,
    ol_edition: row.ol_edition as string | null,
    tags,
    recommendedFor: recs.filter((r) => r.kind === "for").map(({ id, name }) => ({ id, name })),
    recommendedBy: recs.filter((r) => r.kind === "by").map(({ id, name }) => ({ id, name })),
  };
}

export type Facets = {
  shelves: (Named & { count: number })[];
  years: { year: number; count: number }[];
  tags: (Named & { count: number })[];
  people: (Named & { relationship: string; forCount: number; byCount: number })[];
  total: number;
  noShelf: number;
};

export async function getFacets(): Promise<Facets> {
  await connection();
  return {
    shelves: db
      .prepare(`SELECT s.id, s.name, count(bs.book_id) AS count FROM shelves s
                LEFT JOIN book_shelves bs ON bs.shelf_id = s.id GROUP BY s.id ORDER BY s.position, s.name`)
      .all() as Facets["shelves"],
    years: db.prepare("SELECT year, count(*) AS count FROM book_years GROUP BY year ORDER BY year DESC").all() as Facets["years"],
    tags: db
      .prepare(`SELECT t.id, t.name, count(bt.book_id) AS count FROM tags t
                LEFT JOIN book_tags bt ON bt.tag_id = t.id GROUP BY t.id ORDER BY t.name COLLATE NOCASE`)
      .all() as Facets["tags"],
    people: db
      .prepare(`SELECT p.id, ${PERSON_NAME} AS name, p.relationship,
                  (SELECT count(*) FROM recommendations WHERE person_id = p.id AND kind = 'for') AS forCount,
                  (SELECT count(*) FROM recommendations WHERE person_id = p.id AND kind = 'by') AS byCount
                FROM people p ORDER BY p.first COLLATE NOCASE, p.last COLLATE NOCASE`)
      .all() as Facets["people"],
    total: (db.prepare("SELECT count(*) AS n FROM books").get() as { n: number }).n,
    noShelf: (db.prepare("SELECT count(*) AS n FROM books b WHERE NOT EXISTS (SELECT 1 FROM book_shelves WHERE book_id = b.id)").get() as { n: number }).n,
  };
}

export type BookInput = {
  title: string;
  author: string;
  additional_authors: string;
  isbn13: string | null;
  rating: number | null;
  description: string;
  review: string;
  spoiler: string;
  quotes: string;
  private_notes: string;
  on_kindle: boolean;
  owned: boolean;
  publisher: string;
  publish_year: number | null;
  pages: number | null;
  ol_work: string | null;
  ol_edition: string | null;
  years: number[];
  shelves: string[];
  tags: string[];
  /** Person ids, or "new:Full Name" to create someone. */
  recommendedFor: string[];
  recommendedBy: string[];
};

const BOOK_FIELDS = [
  "title", "author", "author_sort", "additional_authors", "isbn13", "rating", "description", "review", "spoiler",
  "quotes", "private_notes", "on_kindle", "owned", "publisher", "publish_year", "pages", "ol_work", "ol_edition",
] as const;

/** Creates (id = null) or updates a book and all of its links. Returns the book id. */
export function saveBook(id: number | null, input: BookInput): number {
  return transaction(() => {
    const values = {
      ...input,
      author_sort: authorSort(input.author),
      on_kindle: input.on_kindle ? 1 : 0,
      owned: input.owned ? 1 : 0,
    };
    const vals = BOOK_FIELDS.map((f) => values[f] as string | number | null);

    let bookId: number;
    if (id === null) {
      const row = db
        .prepare(`INSERT INTO books (${BOOK_FIELDS.join(", ")}) VALUES (${BOOK_FIELDS.map(() => "?").join(", ")}) RETURNING id`)
        .get(...vals) as { id: number };
      bookId = row.id;
    } else {
      db.prepare(`UPDATE books SET ${BOOK_FIELDS.map((f) => `${f} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(
        ...vals,
        id,
      );
      bookId = id;
    }

    db.prepare("DELETE FROM book_years WHERE book_id = ?").run(bookId);
    const insertYear = db.prepare("INSERT OR IGNORE INTO book_years (book_id, year) VALUES (?, ?)");
    for (const y of input.years) insertYear.run(bookId, y);

    db.prepare("DELETE FROM book_shelves WHERE book_id = ?").run(bookId);
    const insertShelf = db.prepare("INSERT OR IGNORE INTO book_shelves (book_id, shelf_id) VALUES (?, ?)");
    for (const name of input.shelves) insertShelf.run(bookId, findOrCreate("shelves", name));

    db.prepare("DELETE FROM book_tags WHERE book_id = ?").run(bookId);
    const insertTag = db.prepare("INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)");
    for (const name of input.tags) insertTag.run(bookId, findOrCreate("tags", name));

    db.prepare("DELETE FROM recommendations WHERE book_id = ?").run(bookId);
    const insertRec = db.prepare("INSERT OR IGNORE INTO recommendations (book_id, person_id, kind) VALUES (?, ?, ?)");
    for (const [kind, people] of [["for", input.recommendedFor], ["by", input.recommendedBy]] as const) {
      for (const p of people) insertRec.run(bookId, resolvePerson(p), kind);
    }
    return bookId;
  });
}

function findOrCreate(table: "shelves" | "tags", name: string): number {
  const found = db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name) as { id: number } | undefined;
  if (found) return found.id;
  const extra = table === "shelves" ? ", position" : "";
  const extraVal = table === "shelves" ? ", (SELECT coalesce(max(position), 0) + 1 FROM shelves)" : "";
  return (db.prepare(`INSERT INTO ${table} (name${extra}) VALUES (?${extraVal}) RETURNING id`).get(name) as { id: number }).id;
}

function resolvePerson(value: string): number {
  if (!value.startsWith("new:")) return Number(value);
  const full = value.slice(4).trim();
  const [first, ...rest] = full.split(/\s+/);
  const existing = db
    .prepare("SELECT id FROM people WHERE first = ? AND last = ?")
    .get(first, rest.join(" ")) as { id: number } | undefined;
  return existing?.id ?? createPerson(first, rest.join(" "), "");
}

export function setCover(id: number, cover: string | null) {
  db.prepare("UPDATE books SET cover = ?, updated_at = datetime('now') WHERE id = ?").run(cover, id);
}

export function getCoverName(id: number): string | null {
  return (db.prepare("SELECT cover FROM books WHERE id = ?").get(id) as { cover: string | null } | undefined)?.cover ?? null;
}

export function deleteBook(id: number) {
  db.prepare("DELETE FROM books WHERE id = ?").run(id);
}

// People

export type Person = { id: number; first: string; last: string; relationship: string };

export async function getPerson(id: number) {
  await connection();
  const person = db.prepare("SELECT id, first, last, relationship FROM people WHERE id = ?").get(id) as Person | undefined;
  if (!person) return null;
  const books = (kind: "for" | "by") =>
    (db
      .prepare(`SELECT ${summaryColumns()} FROM books b JOIN recommendations r ON r.book_id = b.id
                WHERE r.person_id = ? AND r.kind = ? ORDER BY b.id DESC`)
      .all(id, kind) as SummaryRow[]).map(toSummary);
  return { person, recommendedTo: books("for"), recommendedBy: books("by") };
}

export function createPerson(first: string, last: string, relationship: string): number {
  return (db.prepare("INSERT INTO people (first, last, relationship) VALUES (?, ?, ?) RETURNING id").get(first, last, relationship) as {
    id: number;
  }).id;
}

export function updatePerson(id: number, first: string, last: string, relationship: string) {
  db.prepare("UPDATE people SET first = ?, last = ?, relationship = ? WHERE id = ?").run(first, last, relationship, id);
}

export function deletePerson(id: number) {
  db.prepare("DELETE FROM people WHERE id = ?").run(id);
}

// Tags

/** Creates a tag, or returns null if one with this name (ignoring case) already exists. */
export function createTag(name: string): number | null {
  const exists = db.prepare("SELECT id FROM tags WHERE name = ?").get(name);
  if (exists) return null;
  return (db.prepare("INSERT INTO tags (name) VALUES (?) RETURNING id").get(name) as { id: number }).id;
}

export function renameTag(id: number, name: string, notes: string) {
  db.prepare("UPDATE tags SET name = ?, notes = ? WHERE id = ?").run(name, notes, id);
}

/** Moves every book from one tag onto another, then deletes the first. */
export function mergeTag(fromId: number, intoId: number) {
  transaction(() => {
    db.prepare("INSERT OR IGNORE INTO book_tags (book_id, tag_id) SELECT book_id, ? FROM book_tags WHERE tag_id = ?").run(intoId, fromId);
    db.prepare("DELETE FROM tags WHERE id = ?").run(fromId);
  });
}

export function deleteTag(id: number) {
  db.prepare("DELETE FROM tags WHERE id = ?").run(id);
}

export async function getTag(id: number) {
  await connection();
  return db.prepare("SELECT id, name, notes FROM tags WHERE id = ?").get(id) as (Named & { notes: string }) | undefined;
}

// Missing covers

export async function listMissingCovers() {
  await connection();
  return (
    db
      .prepare(
        `SELECT ${summaryColumns()}, b.isbn13 FROM books b
         WHERE b.cover IS NULL AND NOT EXISTS (SELECT 1 FROM cover_skipped WHERE book_id = b.id)
         ORDER BY b.isbn13 IS NULL, b.title COLLATE NOCASE`,
      )
      .all() as (SummaryRow & { isbn13: string | null })[]
  ).map((r) => ({ ...toSummary(r), isbn13: r.isbn13 }));
}

export async function countMissingCovers() {
  await connection();
  return (
    db
      .prepare("SELECT count(*) AS n FROM books b WHERE cover IS NULL AND NOT EXISTS (SELECT 1 FROM cover_skipped WHERE book_id = b.id)")
      .get() as { n: number }
  ).n;
}

export function skipCover(id: number) {
  db.prepare("INSERT OR IGNORE INTO cover_skipped (book_id) VALUES (?)").run(id);
}

export function getBookForCoverSearch(id: number) {
  return db.prepare("SELECT id, title, author, isbn13 FROM books WHERE id = ?").get(id) as
    | { id: number; title: string; author: string; isbn13: string | null }
    | undefined;
}

// Reading status: To Read / Currently Reading / Read / Abandoned are one-at-a-time; other shelves are kept.

export const STATUS = ["To Read", "Currently Reading", "Read", "Abandoned"];

/** Sets the book's status shelf, or clears it when `shelf` is already the only status. Returns the new status. */
export function toggleStatus(bookId: number, shelf: string): string | null {
  return transaction(() => {
    const current = (db
      .prepare(`SELECT s.name FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id WHERE bs.book_id = ? AND s.name IN (${STATUS.map(() => "?").join(",")})`)
      .all(bookId, ...STATUS) as { name: string }[]).map((r) => r.name);
    db.prepare(
      `DELETE FROM book_shelves WHERE book_id = ? AND shelf_id IN (SELECT id FROM shelves WHERE name IN (${STATUS.map(() => "?").join(",")}))`,
    ).run(bookId, ...STATUS);
    if (current.length === 1 && current[0] === shelf) return null;
    db.prepare("INSERT OR IGNORE INTO book_shelves (book_id, shelf_id) VALUES (?, ?)").run(bookId, findOrCreate("shelves", shelf));
    db.prepare("UPDATE books SET updated_at = datetime('now') WHERE id = ?").run(bookId);
    return shelf;
  });
}

export function findBookByIsbn(isbn13: string) {
  return db.prepare("SELECT id, title FROM books WHERE isbn13 = ? ORDER BY id LIMIT 1").get(isbn13) as { id: number; title: string } | undefined;
}

/**
 * Facet counts that respect the other active filters: shelf counts ignore the shelf filter,
 * year counts ignore the year filter, and so on, so each control shows what picking it would give.
 */
export async function getContextualFacets(f: Filters, all: Facets): Promise<Facets> {
  const [forShelves, forYears, forTags] = await Promise.all([
    listBooks({ ...f, shelf: undefined, sort: undefined }),
    listBooks({ ...f, year: undefined, sort: undefined }),
    listBooks({ ...f, tag: undefined, sort: undefined }),
  ]);
  const tally = <K,>(books: BookSummary[], keys: (b: BookSummary) => K[]) => {
    const m = new Map<K, number>();
    for (const b of books) for (const k of keys(b)) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const shelfCounts = tally(forShelves, (b) => b.shelves);
  const yearCounts = tally(forYears, (b) => b.years);
  const tagCounts = tally(forTags, (b) => b.tagIds);

  return {
    ...all,
    total: forShelves.length,
    noShelf: forShelves.filter((b) => b.shelves.length === 0).length,
    shelves: all.shelves.map((s) => ({ ...s, count: shelfCounts.get(s.name) ?? 0 })),
    years: all.years.map((y) => ({ ...y, count: yearCounts.get(y.year) ?? 0 })).filter((y) => y.count > 0 || String(y.year) === f.year),
    tags: all.tags.map((t) => ({ ...t, count: tagCounts.get(t.id) ?? 0 })).filter((t) => t.count > 0 || String(t.id) === f.tag),
  };
}
