import "server-only";
import { authorSort } from "./names";
import { db } from "./db";
import { setBookSeries } from "./books";
import { getOpenLibraryDetails, searchOpenLibrary } from "./openlibrary";

/**
 * Bulk OpenLibrary refresh: for every book with an ISBN, fill empty fields from OpenLibrary and
 * queue real differences (title, author, series) as suggestions to accept or dismiss. Covers
 * are left to the Missing covers page. The refresh page drives it in small batches (serverless
 * functions can't run a background job), and each finished book is stamped with ol_checked_at,
 * so a stopped run picks up where it left off.
 */

export type BatchResult = { checked: number; filled: number; suggested: number; failed: number; cursor: number | null; last: string | null };

const BATCH_SIZE = 4;
const CONCURRENCY = 2;

export async function getRefreshStatus(): Promise<{ total: number; remaining: number; suggestions: number }> {
  return {
    total: ((await db.prepare("SELECT count(*) AS n FROM books WHERE isbn13 IS NOT NULL").get()) as { n: number }).n,
    remaining: ((await db.prepare("SELECT count(*) AS n FROM books WHERE isbn13 IS NOT NULL AND ol_checked_at IS NULL").get()) as { n: number }).n,
    suggestions: ((await db.prepare("SELECT count(*) AS n FROM refresh_suggestions").get()) as { n: number }).n,
  };
}

/** Marks every book with an ISBN as unchecked, for "Check all again". */
export async function resetRefresh() {
  await db.exec("UPDATE books SET ol_checked_at = NULL WHERE isbn13 IS NOT NULL");
}

/**
 * Checks the next few unchecked books, newest first, below `cursor` (the lowest id already tried
 * this run, so books that fail are skipped rather than retried forever). `cursor` is null when done.
 */
export async function refreshBatch(cursor: number | null): Promise<BatchResult> {
  const ids = ((await db
    .prepare("SELECT id FROM books WHERE isbn13 IS NOT NULL AND ol_checked_at IS NULL AND id < ? ORDER BY id DESC LIMIT ?")
    .all(cursor ?? Number.MAX_SAFE_INTEGER, BATCH_SIZE)) as { id: number }[]).map((r) => r.id);
  const result: BatchResult = { checked: 0, filled: 0, suggested: 0, failed: 0, cursor: ids.length ? ids[ids.length - 1] : null, last: null };

  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        const r = await refreshBook(id);
        if (!r) continue;
        result.checked++;
        if (r.filled) result.filled++;
        result.suggested += r.suggested;
        result.last = r.title;
      } catch {
        result.failed++; // left unchecked, so the next run retries it
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return result;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[:(]/)[0]
    .replace(/^\s*(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "Shades of Magic ; 3" / "Shades of Magic -- 3" / "Shades of Magic, #3" -> name and position. */
function parseSeriesLabel(label: string): { name: string; position: number | null } {
  const m = label.match(/^(.*?)[\s,;:#–-]*(?:book|vol\.?|volume|no\.?|#)?\s*(\d+(?:\.\d+)?)\s*\)?$/i);
  return m && m[1].trim() ? { name: m[1].trim().replace(/[,;:–-]+$/, "").trim(), position: Number(m[2]) } : { name: label.trim(), position: null };
}

type BookRow = {
  id: number;
  title: string;
  author: string;
  isbn13: string;
  description: string;
  publisher: string;
  publish_year: number | null;
  pages: number | null;
  additional_authors: string;
  ol_work: string | null;
  ol_edition: string | null;
};

async function refreshBook(id: number): Promise<{ title: string; filled: boolean; suggested: number } | null> {
  const book = (await db
    .prepare("SELECT id, title, author, isbn13, description, publisher, publish_year, pages, additional_authors, ol_work, ol_edition FROM books WHERE id = ?")
    .get(id)) as BookRow | undefined;
  if (!book) return null;
  let filled = false;
  let suggested = 0;

  const [match] = await searchOpenLibrary(book.isbn13);
  if (match) {
    const d = await getOpenLibraryDetails(match.work, match.edition);
    const found = {
      publisher: d?.publisher || match.publisher,
      publish_year: d?.publish_year ?? match.year,
      pages: d?.pages ?? match.pages,
      description: d?.description ?? "",
      additional_authors: d?.additional_authors ?? "",
      ol_work: match.work,
      ol_edition: match.edition,
    };

    // Fill only what's empty; never overwrite what's there.
    const fills: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(found) as [keyof typeof found, string | number | null][]) {
      const current = book[k];
      if ((current === null || current === "") && v !== null && v !== "") fills[k] = v;
    }
    const keys = Object.keys(fills);
    if (keys.length) {
      (await db.prepare(`UPDATE books SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(
        ...keys.map((k) => fills[k]),
        id,
      ));
      filled = true;
    }

    // Differences worth a look: a different title or author (not just case or a subtitle), or a series.
    const suggest = async (field: string, value: string) => {
      const r = (await db.prepare("INSERT OR IGNORE INTO refresh_suggestions (book_id, field, value) VALUES (?, ?, ?)").run(id, field, value));
      if (r.changes) suggested++;
    };
    if (d?.title && normalize(d.title) && normalize(d.title) !== normalize(book.title)) await suggest("title", d.title);
    const olAuthor = d?.author || match.authors[0] || "";
    if (olAuthor && book.author && normalize(olAuthor) !== normalize(book.author)) await suggest("author", olAuthor);
    const inSeries = (await db.prepare("SELECT 1 FROM book_series WHERE book_id = ?").get(id));
    if (d?.series && !inSeries) await suggest("series", d.series);
  }
  (await db.prepare("UPDATE books SET ol_checked_at = datetime('now') WHERE id = ?").run(id));
  return { title: book.title, filled, suggested };
}

export type Suggestion = { book_id: number; field: "title" | "author" | "series"; value: string; title: string; author: string; current: string };

export async function listSuggestions(): Promise<Suggestion[]> {
  return (await db
    .prepare(
      `SELECT rs.book_id, rs.field, rs.value, b.title, b.author,
         CASE rs.field WHEN 'title' THEN b.title WHEN 'author' THEN b.author
           ELSE coalesce((SELECT s.name FROM book_series bs JOIN series s ON s.id = bs.series_id WHERE bs.book_id = b.id), '') END AS current
       FROM refresh_suggestions rs JOIN books b ON b.id = rs.book_id ORDER BY rs.field, b.title COLLATE NOCASE`,
    )
    .all()) as Suggestion[];
}

export async function acceptSuggestion(bookId: number, field: string) {
  const row = (await db.prepare("SELECT value FROM refresh_suggestions WHERE book_id = ? AND field = ?").get(bookId, field)) as { value: string } | undefined;
  if (!row) return;
  if (field === "title") (await db.prepare("UPDATE books SET title = ?, updated_at = datetime('now') WHERE id = ?").run(row.value, bookId));
  if (field === "author") (await db.prepare("UPDATE books SET author = ?, author_sort = ?, updated_at = datetime('now') WHERE id = ?").run(row.value, authorSort(row.value), bookId));
  if (field === "series") {
    const { name, position } = parseSeriesLabel(row.value);
    await setBookSeries(bookId, name, position);
  }
  await dismissSuggestion(bookId, field);
}

export async function dismissSuggestion(bookId: number, field: string) {
  (await db.prepare("DELETE FROM refresh_suggestions WHERE book_id = ? AND field = ?").run(bookId, field));
}
