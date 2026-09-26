import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { db, deleteBookRows, transaction } from "./db";
import { searchBooks, type SearchEntry } from "./search";
import { authorSort, slugify } from "./names";

export type Named = { id: number; name: string };
/** A person to link to: /people/<slug>. */
export type PersonLink = Named & { slug: string };

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
  /** Times read, counting re-reads. */
  readCount: number;
};

export type Book = BookSummary & {
  additional_authors: string;
  author_original: string;
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
  borrowed: boolean;
  library: string;
  due_date: string | null;
  bad_isbn: string | null;
  tags: Named[];
  recommendedFor: PersonLink[];
  recommendedBy: PersonLink[];
  reads: Read[];
  series: { id: number; name: string; position: number | null } | null;
};

export type Read = { id: number; year: number; note: string };

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
    (SELECT group_concat(year, ',') FROM (SELECT DISTINCT year FROM book_reads WHERE book_id = b.id ORDER BY year)) AS years,
    (SELECT count(*) FROM book_reads WHERE book_id = b.id) AS read_count,
    (SELECT group_concat(name, '|') FROM (SELECT s.name FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id
       WHERE bs.book_id = b.id ORDER BY s.position)) AS shelves,
    (SELECT group_concat(tag_id, ',') FROM book_tags WHERE book_id = b.id) AS tag_ids`;
}

type SummaryRow = Omit<BookSummary, "years" | "shelves" | "tagIds" | "readCount"> & {
  years: string | null;
  shelves: string | null;
  tag_ids: string | null;
  read_count: number;
};

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
    readCount: r.read_count ?? 0,
  };
}

export async function listBooks(f: Filters): Promise<BookSummary[]> {
  await connection();
  const where: string[] = [];
  const params: Params = [];

  // Search runs in JS over the same index the browser uses, so both find the same books.
  let rank: Map<number, number> | null = null;
  if (f.q?.trim()) {
    const hits = searchBooks(await getSearchEntries(), f.q);
    rank = new Map(hits.map((h, i) => [h.entry.id, i]));
    where.push("b.id IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(hits.map((h) => h.entry.id)));
  }
  if (f.shelf === "none") {
    where.push("NOT EXISTS (SELECT 1 FROM book_shelves bs WHERE bs.book_id = b.id)");
  } else if (f.shelf) {
    where.push("EXISTS (SELECT 1 FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id WHERE bs.book_id = b.id AND s.name = ?)");
    params.push(f.shelf);
  }
  if (f.year === "none") {
    where.push("NOT EXISTS (SELECT 1 FROM book_reads y WHERE y.book_id = b.id)");
  } else if (f.year) {
    where.push("EXISTS (SELECT 1 FROM book_reads y WHERE y.book_id = b.id AND y.year = ?)");
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
  if (f.owned === "borrowed") where.push("b.borrowed = 1");

  const order =
    {
      title: "b.title COLLATE NOCASE",
      author: "b.author_sort COLLATE NOCASE, b.title COLLATE NOCASE",
      rating: "b.rating IS NULL, b.rating DESC, b.title COLLATE NOCASE",
      read: "(SELECT max(year) FROM book_reads WHERE book_id = b.id) IS NULL, (SELECT max(year) FROM book_reads WHERE book_id = b.id) DESC, b.id DESC",
    }[f.sort ?? ""] ?? "b.id DESC";

  const sql = `SELECT ${summaryColumns()} FROM books b ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order}`;
  const books = ((await db.prepare(sql).all(...params)) as SummaryRow[]).map(toSummary);
  // Searches without a chosen sort show the best matches first.
  if (rank && !f.sort) books.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return books;
}

/** Everything search looks at, one row per book. Also served to the browser for instant and offline search. */
export const getSearchEntries = cache(async (): Promise<SearchEntry[]> => {
  const rows = (await db
    .prepare(
      `SELECT b.id, b.title, b.author, b.author_original, b.additional_authors, coalesce(b.isbn13, '') AS isbn, b.cover, b.rating,
         coalesce((SELECT s.name FROM book_series x JOIN series s ON s.id = x.series_id WHERE x.book_id = b.id), '') AS series,
         coalesce((SELECT group_concat(t.name, ' ') FROM book_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.book_id = b.id), '') AS tags,
         coalesce((SELECT s.name FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id WHERE bs.book_id = b.id ORDER BY s.position LIMIT 1), '') AS shelf,
         (SELECT max(year) FROM book_reads WHERE book_id = b.id) AS year,
         trim(coalesce(b.review, '') || ' ' || coalesce(b.quotes, '') || ' ' || coalesce(b.private_notes, '')) AS text
       FROM books b ORDER BY b.id DESC`,
    )
    .all()) as Record<string, string | number | null>[];
  return rows.map((r) => ({
    id: r.id as number,
    title: r.title as string,
    author: r.author as string,
    authorOriginal: (r.author_original as string) ?? "",
    additionalAuthors: (r.additional_authors as string) ?? "",
    series: r.series as string,
    tags: r.tags as string,
    isbn: r.isbn as string,
    cover: r.cover as string | null,
    rating: r.rating as number | null,
    shelf: r.shelf as string,
    year: r.year as number | null,
    text: (r.text as string) ?? "",
  }));
});

export async function getBook(id: number): Promise<Book | null> {
  await connection();
  const row = (await db.prepare(`SELECT b.*, ${summaryColumns()} FROM books b WHERE b.id = ?`).get(id)) as
    | (SummaryRow & Record<string, unknown>)
    | undefined;
  if (!row) return null;

  const tags = (await db
    .prepare("SELECT t.id, t.name FROM book_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.book_id = ? ORDER BY t.name")
    .all(id)) as Named[];
  const recs = (await db
    .prepare(`SELECT p.id, p.slug, ${PERSON_NAME} AS name, r.kind FROM recommendations r JOIN people p ON p.id = r.person_id
              WHERE r.book_id = ? ORDER BY p.first, p.last`)
    .all(id)) as (PersonLink & { kind: "for" | "by" })[];

  return {
    ...toSummary(row),
    additional_authors: row.additional_authors as string,
    author_original: (row.author_original as string) ?? "",
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
    borrowed: row.borrowed === 1,
    library: (row.library as string) ?? "",
    due_date: (row.due_date as string | null) ?? null,
    bad_isbn: (row.bad_isbn as string | null) ?? null,
    tags,
    reads: (await db.prepare("SELECT id, year, note FROM book_reads WHERE book_id = ? ORDER BY year DESC, id DESC").all(id)) as Read[],
    series:
      ((await db
        .prepare("SELECT s.id, s.name, bs.position FROM book_series bs JOIN series s ON s.id = bs.series_id WHERE bs.book_id = ?")
        .get(id)) as Book["series"] | undefined) ?? null,
    recommendedFor: recs.filter((r) => r.kind === "for").map(({ id, slug, name }) => ({ id, slug, name })),
    recommendedBy: recs.filter((r) => r.kind === "by").map(({ id, slug, name }) => ({ id, slug, name })),
  };
}

export type Facets = {
  shelves: (Named & { count: number })[];
  years: { year: number; count: number }[];
  tags: (Named & { count: number })[];
  people: (PersonLink & { relationship: string; forCount: number; byCount: number })[];
  total: number;
  noShelf: number;
};

export async function getFacets(): Promise<Facets> {
  await connection();
  return {
    shelves: (await db
      .prepare(`SELECT s.id, s.name, count(bs.book_id) AS count FROM shelves s
                LEFT JOIN book_shelves bs ON bs.shelf_id = s.id GROUP BY s.id ORDER BY s.position, s.name`)
      .all()) as Facets["shelves"],
    years: (await db.prepare("SELECT year, count(DISTINCT book_id) AS count FROM book_reads GROUP BY year ORDER BY year DESC").all()) as Facets["years"],
    tags: (await db
      .prepare(`SELECT t.id, t.name, count(bt.book_id) AS count FROM tags t
                LEFT JOIN book_tags bt ON bt.tag_id = t.id GROUP BY t.id ORDER BY t.name COLLATE NOCASE`)
      .all()) as Facets["tags"],
    people: (await db
      .prepare(`SELECT p.id, p.slug, ${PERSON_NAME} AS name, p.relationship,
                  (SELECT count(*) FROM recommendations WHERE person_id = p.id AND kind = 'for') AS forCount,
                  (SELECT count(*) FROM recommendations WHERE person_id = p.id AND kind = 'by') AS byCount
                FROM people p ORDER BY p.first COLLATE NOCASE, p.last COLLATE NOCASE`)
      .all()) as Facets["people"],
    total: ((await db.prepare("SELECT count(*) AS n FROM books").get()) as { n: number }).n,
    noShelf: ((await db.prepare("SELECT count(*) AS n FROM books b WHERE NOT EXISTS (SELECT 1 FROM book_shelves WHERE book_id = b.id)").get()) as { n: number }).n,
  };
}

export type BookInput = {
  title: string;
  author: string;
  author_original: string;
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
  borrowed: boolean;
  library: string;
  due_date: string | null;
  series_name: string;
  series_position: number | null;
  years: number[];
  shelves: string[];
  tags: string[];
  /** Person ids, or "new:Full Name" to create someone. */
  recommendedFor: string[];
  recommendedBy: string[];
};

const BOOK_FIELDS = [
  "title", "author", "author_sort", "author_original", "additional_authors", "isbn13", "rating", "description", "review", "spoiler",
  "quotes", "private_notes", "on_kindle", "owned", "publisher", "publish_year", "pages", "ol_work", "ol_edition",
  "borrowed", "library", "due_date",
] as const;

/** Creates (id = null) or updates a book and all of its links. Returns the book id. */
export async function saveBook(id: number | null, input: BookInput): Promise<number> {
  return await transaction(async () => {
    const values = {
      ...input,
      author_sort: authorSort(input.author),
      on_kindle: input.on_kindle ? 1 : 0,
      owned: input.owned ? 1 : 0,
      borrowed: input.borrowed ? 1 : 0,
      library: input.borrowed ? input.library : "",
      due_date: input.borrowed ? input.due_date : null,
    };
    const vals = BOOK_FIELDS.map((f) => values[f] as string | number | null);

    let bookId: number;
    if (id === null) {
      const row = (await db
        .prepare(`INSERT INTO books (${BOOK_FIELDS.join(", ")}) VALUES (${BOOK_FIELDS.map(() => "?").join(", ")}) RETURNING id`)
        .get(...vals)) as { id: number };
      bookId = row.id;
    } else {
      (await db.prepare(`UPDATE books SET ${BOOK_FIELDS.map((f) => `${f} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(
        ...vals,
        id,
      ));
      bookId = id;
    }

    // The form edits which years a book was read in. Keep existing reads (and their notes and
    // re-reads) for years that stay; drop years that were removed; add one read for new years.
    const keptYears = new Set(input.years);
    const existing = new Set(((await db.prepare("SELECT DISTINCT year FROM book_reads WHERE book_id = ?").all(bookId)) as { year: number }[]).map((r) => r.year));
    for (const y of existing) if (!keptYears.has(y)) (await db.prepare("DELETE FROM book_reads WHERE book_id = ? AND year = ?").run(bookId, y));
    for (const y of keptYears) if (!existing.has(y)) (await db.prepare("INSERT INTO book_reads (book_id, year) VALUES (?, ?)").run(bookId, y));

    (await db.prepare("DELETE FROM book_shelves WHERE book_id = ?").run(bookId));
    const insertShelf = db.prepare("INSERT OR IGNORE INTO book_shelves (book_id, shelf_id) VALUES (?, ?)");
    for (const name of input.shelves) (await insertShelf.run(bookId, await findOrCreate("shelves", name)));

    (await db.prepare("DELETE FROM book_tags WHERE book_id = ?").run(bookId));
    const insertTag = db.prepare("INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)");
    for (const name of input.tags) (await insertTag.run(bookId, await findOrCreate("tags", name)));

    (await db.prepare("DELETE FROM recommendations WHERE book_id = ?").run(bookId));
    const insertRec = db.prepare("INSERT OR IGNORE INTO recommendations (book_id, person_id, kind) VALUES (?, ?, ?)");
    for (const [kind, people] of [["for", input.recommendedFor], ["by", input.recommendedBy]] as const) {
      for (const p of people) (await insertRec.run(bookId, await resolvePerson(p), kind));
    }
    await setBookSeries(bookId, input.series_name, input.series_position);
    return bookId;
  });
}

async function findOrCreate(table: "shelves" | "tags", name: string): Promise<number> {
  const found = (await db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name)) as { id: number } | undefined;
  if (found) return found.id;
  const extra = table === "shelves" ? ", position" : "";
  const extraVal = table === "shelves" ? ", (SELECT coalesce(max(position), 0) + 1 FROM shelves)" : "";
  return ((await db.prepare(`INSERT INTO ${table} (name${extra}) VALUES (?${extraVal}) RETURNING id`).get(name)) as { id: number }).id;
}

async function resolvePerson(value: string): Promise<number> {
  if (!value.startsWith("new:")) return Number(value);
  const full = value.slice(4).trim();
  const [first, ...rest] = full.split(/\s+/);
  const existing = (await db
    .prepare("SELECT id FROM people WHERE first = ? AND last = ?")
    .get(first, rest.join(" "))) as { id: number } | undefined;
  return existing?.id ?? (await createPerson(first, rest.join(" "), "")).id;
}

export async function setCover(id: number, cover: string | null) {
  (await db.prepare("UPDATE books SET cover = ?, updated_at = datetime('now') WHERE id = ?").run(cover, id));
}

export async function getCoverName(id: number): Promise<string | null> {
  return ((await db.prepare("SELECT cover FROM books WHERE id = ?").get(id)) as { cover: string | null } | undefined)?.cover ?? null;
}

export async function deleteBook(id: number) {
  await deleteBookRows(id);
}

// People

export type Person = { id: number; slug: string; first: string; last: string; relationship: string };

/** Looks a person up by slug, or by id for old /people/12 links. */
export async function getPerson(slugOrId: string) {
  await connection();
  const byId = /^\d+$/.test(slugOrId);
  const person = (await db
    .prepare(`SELECT id, slug, first, last, relationship FROM people WHERE ${byId ? "id" : "slug"} = ?`)
    .get(byId ? Number(slugOrId) : slugOrId)) as Person | undefined;
  if (!person) return null;
  const books = async (kind: "for" | "by") =>
    ((await db
      .prepare(`SELECT ${summaryColumns()} FROM books b JOIN recommendations r ON r.book_id = b.id
                WHERE r.person_id = ? AND r.kind = ? ORDER BY b.id DESC`)
      .all(person.id, kind)) as SummaryRow[]).map(toSummary);
  const [recommendedTo, recommendedBy] = await Promise.all([books("for"), books("by")]);
  return { person, recommendedTo, recommendedBy };
}

/** "colette-shade", or "colette-shade-2" if someone else already has it. */
async function uniquePersonSlug(first: string, last: string, exceptId: number | null = null): Promise<string> {
  const base = slugify(first, last);
  const taken = new Set(
    ((await db.prepare("SELECT slug FROM people WHERE (slug = ? OR slug LIKE ?) AND id IS NOT ?").all(base, `${base}-%`, exceptId)) as { slug: string }[]).map(
      (r) => r.slug,
    ),
  );
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export async function createPerson(first: string, last: string, relationship: string): Promise<{ id: number; slug: string }> {
  const slug = await uniquePersonSlug(first, last);
  return (await db
    .prepare("INSERT INTO people (first, last, relationship, slug) VALUES (?, ?, ?, ?) RETURNING id, slug")
    .get(first, last, relationship, slug)) as { id: number; slug: string };
}

/** Saves the person and returns their slug, which changes with their name. */
export async function updatePerson(id: number, first: string, last: string, relationship: string): Promise<string> {
  const slug = await uniquePersonSlug(first, last, id);
  await db.prepare("UPDATE people SET first = ?, last = ?, relationship = ?, slug = ? WHERE id = ?").run(first, last, relationship, slug, id);
  return slug;
}

export async function deletePerson(id: number) {
  await transaction(async () => {
    await db.prepare("DELETE FROM recommendations WHERE person_id = ?").run(id);
    await db.prepare("DELETE FROM share_pages WHERE person_id = ?").run(id);
    await db.prepare("DELETE FROM people WHERE id = ?").run(id);
  });
}

// Tags

/** Creates a tag, or returns null if one with this name (ignoring case) already exists. */
export async function createTag(name: string): Promise<number | null> {
  const exists = (await db.prepare("SELECT id FROM tags WHERE name = ?").get(name));
  if (exists) return null;
  return ((await db.prepare("INSERT INTO tags (name) VALUES (?) RETURNING id").get(name)) as { id: number }).id;
}

export async function renameTag(id: number, name: string, notes: string) {
  (await db.prepare("UPDATE tags SET name = ?, notes = ? WHERE id = ?").run(name, notes, id));
}

/** Moves every book from one tag onto another, then deletes the first. */
export async function mergeTag(fromId: number, intoId: number) {
  await transaction(async () => {
    (await db.prepare("INSERT OR IGNORE INTO book_tags (book_id, tag_id) SELECT book_id, ? FROM book_tags WHERE tag_id = ?").run(intoId, fromId));
    await deleteTag(fromId);
  });
}

export async function deleteTag(id: number) {
  await transaction(async () => {
    await db.prepare("DELETE FROM book_tags WHERE tag_id = ?").run(id);
    await db.prepare("DELETE FROM tags WHERE id = ?").run(id);
  });
}

export async function getTag(id: number) {
  await connection();
  return (await db.prepare("SELECT id, name, notes FROM tags WHERE id = ?").get(id)) as (Named & { notes: string }) | undefined;
}

// Missing covers

export async function listMissingCovers() {
  await connection();
  return (
    (await db
      .prepare(
        `SELECT ${summaryColumns()}, b.isbn13 FROM books b
         WHERE b.cover IS NULL AND NOT EXISTS (SELECT 1 FROM cover_skipped WHERE book_id = b.id)
         ORDER BY b.isbn13 IS NULL, b.title COLLATE NOCASE`,
      )
      .all()) as (SummaryRow & { isbn13: string | null })[]
  ).map((r) => ({ ...toSummary(r), isbn13: r.isbn13 }));
}

export async function countMissingCovers() {
  await connection();
  return (
    (await db
      .prepare("SELECT count(*) AS n FROM books b WHERE cover IS NULL AND NOT EXISTS (SELECT 1 FROM cover_skipped WHERE book_id = b.id)")
      .get()) as { n: number }
  ).n;
}

export async function skipCover(id: number) {
  (await db.prepare("INSERT OR IGNORE INTO cover_skipped (book_id) VALUES (?)").run(id));
}

export async function getBookForCoverSearch(id: number) {
  return (await db.prepare("SELECT id, title, author, isbn13 FROM books WHERE id = ?").get(id)) as
    | { id: number; title: string; author: string; isbn13: string | null }
    | undefined;
}

// Reading status: To Read / Currently Reading / Read / Abandoned are one-at-a-time; other shelves are kept.

export const STATUS = ["To Read", "Currently Reading", "Read", "Abandoned"];

/** Sets the book's status shelf, or clears it when `shelf` is already the only status. Returns the new status. */
export async function toggleStatus(bookId: number, shelf: string): Promise<string | null> {
  return await transaction(async () => {
    const current = ((await db
      .prepare(`SELECT s.name FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id WHERE bs.book_id = ? AND s.name IN (${STATUS.map(() => "?").join(",")})`)
      .all(bookId, ...STATUS)) as { name: string }[]).map((r) => r.name);
    (await db.prepare(
      `DELETE FROM book_shelves WHERE book_id = ? AND shelf_id IN (SELECT id FROM shelves WHERE name IN (${STATUS.map(() => "?").join(",")}))`,
    ).run(bookId, ...STATUS));
    if (current.length === 1 && current[0] === shelf) return null;
    (await db.prepare("INSERT OR IGNORE INTO book_shelves (book_id, shelf_id) VALUES (?, ?)").run(bookId, await findOrCreate("shelves", shelf)));
    (await db.prepare("UPDATE books SET updated_at = datetime('now') WHERE id = ?").run(bookId));
    return shelf;
  });
}

export async function findBookByIsbn(isbn13: string) {
  return (await db.prepare("SELECT id, title FROM books WHERE isbn13 = ? ORDER BY id LIMIT 1").get(isbn13)) as { id: number; title: string } | undefined;
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

// Re-reads

export async function addRead(bookId: number, year: number, note: string) {
  (await db.prepare("INSERT INTO book_reads (book_id, year, note) VALUES (?, ?, ?)").run(bookId, year, note));
  (await db.prepare("UPDATE books SET updated_at = datetime('now') WHERE id = ?").run(bookId));
}

export async function updateRead(readId: number, year: number, note: string) {
  (await db.prepare("UPDATE book_reads SET year = ?, note = ? WHERE id = ?").run(year, note, readId));
}

export async function deleteRead(readId: number) {
  (await db.prepare("DELETE FROM book_reads WHERE id = ?").run(readId));
}

// Series

/** Puts a book in a series (created if new) at a position, or takes it out when the name is blank. */
export async function setBookSeries(bookId: number, name: string, position: number | null) {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) {
    (await db.prepare("DELETE FROM book_series WHERE book_id = ?").run(bookId));
  } else {
    const found = (await db.prepare("SELECT id FROM series WHERE name = ?").get(clean)) as { id: number } | undefined;
    const seriesId = found?.id ?? ((await db.prepare("INSERT INTO series (name) VALUES (?) RETURNING id").get(clean)) as { id: number }).id;
    (await db.prepare(
      "INSERT INTO book_series (book_id, series_id, position) VALUES (?, ?, ?) ON CONFLICT(book_id) DO UPDATE SET series_id = excluded.series_id, position = excluded.position",
    ).run(bookId, seriesId, position));
  }
  // Series with no books left go away.
  await db.exec("DELETE FROM series WHERE id NOT IN (SELECT series_id FROM book_series)");
}

export type SeriesSummary = { id: number; name: string; count: number; read: number; covers: (string | null)[] };

export async function listSeries(): Promise<SeriesSummary[]> {
  await connection();
  const rows = (await db
    .prepare(
      `SELECT s.id, s.name, count(bs.book_id) AS count,
         sum(EXISTS (SELECT 1 FROM book_reads r WHERE r.book_id = bs.book_id)) AS read,
         (SELECT group_concat(coalesce(cover, ''), '|') FROM (SELECT b.cover FROM book_series x JOIN books b ON b.id = x.book_id
            WHERE x.series_id = s.id ORDER BY x.position IS NULL, x.position, b.title LIMIT 4)) AS covers
       FROM series s JOIN book_series bs ON bs.series_id = s.id GROUP BY s.id ORDER BY s.name COLLATE NOCASE`,
    )
    .all()) as (Omit<SeriesSummary, "covers"> & { covers: string | null })[];
  return rows.map((r) => ({ ...r, covers: (r.covers ?? "").split("|").map((c) => c || null) }));
}

export async function getSeries(id: number) {
  await connection();
  const series = (await db.prepare("SELECT id, name FROM series WHERE id = ?").get(id)) as Named | undefined;
  if (!series) return null;
  const books = (
    (await db
      .prepare(
        `SELECT ${summaryColumns()}, bs.position FROM books b JOIN book_series bs ON bs.book_id = b.id
         WHERE bs.series_id = ? ORDER BY bs.position IS NULL, bs.position, b.title COLLATE NOCASE`,
      )
      .all(id)) as (SummaryRow & { position: number | null })[]
  ).map((r) => ({ ...toSummary(r), position: r.position }));
  return { series, books };
}

export async function renameSeries(id: number, name: string) {
  (await db.prepare("UPDATE series SET name = ? WHERE id = ?").run(name, id));
}

/** "A Conjuring of Light (Shades of Magic, #3)" -> { name: "Shades of Magic", position: 3 } */
export function seriesFromTitle(title: string): { name: string; position: number | null } | null {
  const m = title.match(/\(([^()#]+?),?\s*#(\d+(?:\.\d+)?)\)\s*$/);
  return m ? { name: m[1].trim(), position: Number(m[2]) } : null;
}

/** Books whose title names a series they aren't in yet. */
export async function detectSeriesFromTitles() {
  await connection();
  const rows = (await db
    .prepare("SELECT id, title FROM books WHERE id NOT IN (SELECT book_id FROM book_series) AND title LIKE '%#%)%'")
    .all()) as { id: number; title: string }[];
  return rows.flatMap((r) => {
    const found = seriesFromTitle(r.title);
    return found ? [{ bookId: r.id, title: r.title, ...found }] : [];
  });
}

export async function seriesNames(): Promise<string[]> {
  return ((await db.prepare("SELECT name FROM series ORDER BY name COLLATE NOCASE").all()) as { name: string }[]).map((r) => r.name);
}

// Library borrowing

export async function listBorrowed() {
  await connection();
  return (
    (await db
      .prepare(`SELECT ${summaryColumns()}, b.library, b.due_date FROM books b WHERE b.borrowed = 1 ORDER BY b.due_date IS NULL, b.due_date`)
      .all()) as (SummaryRow & { library: string; due_date: string | null })[]
  ).map((r) => ({ ...toSummary(r), library: r.library, due_date: r.due_date }));
}

// Missing ISBNs

export async function listMissingIsbns() {
  await connection();
  return (await db
    .prepare(
      `SELECT id, title, author, cover, bad_isbn FROM books WHERE isbn13 IS NULL AND isbn_skipped = 0
       ORDER BY bad_isbn IS NULL, title COLLATE NOCASE`,
    )
    .all()) as { id: number; title: string; author: string; cover: string | null; bad_isbn: string | null }[];
}

export async function countMissingIsbns() {
  await connection();
  return ((await db.prepare("SELECT count(*) AS n FROM books WHERE isbn13 IS NULL AND isbn_skipped = 0").get()) as { n: number }).n;
}

export async function setIsbn(bookId: number, isbn13: string, olWork: string | null, olEdition: string | null) {
  (await db.prepare(
    `UPDATE books SET isbn13 = ?, bad_isbn = NULL, ol_work = coalesce(ol_work, ?), ol_edition = coalesce(ol_edition, ?),
       updated_at = datetime('now') WHERE id = ?`,
  ).run(isbn13, olWork, olEdition, bookId));
}

export async function skipIsbn(bookId: number) {
  (await db.prepare("UPDATE books SET isbn_skipped = 1 WHERE id = ?").run(bookId));
}
