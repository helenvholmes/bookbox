import "server-only";
import { parse } from "csv-parse/sync";
import { saveBook, setCover } from "./books";
import { fetchCover, isUsableImage, saveCover } from "./covers";
import { isDay } from "./dates";
import { db } from "./db";
import { toIsbn13 } from "./names";
import { fold } from "./search";

/**
 * Importing a Goodreads library export (My Books → Import and export → Export library). The
 * file is read into plain books first, so Settings can show what will come in and which books
 * look like ones already in the library; then the chosen ones are added a batch at a time, and
 * their covers fetched from OpenLibrary by ISBN.
 */

export type GoodreadsBook = {
  /** Row number in the file, to pick books by. */
  row: number;
  title: string;
  author: string;
  additionalAuthors: string;
  isbn13: string | null;
  rating: number | null;
  publisher: string;
  pages: number | null;
  publishYear: number | null;
  status: "To Read" | "Currently Reading" | "Read" | "Abandoned" | null;
  /** Goodreads' other shelves, which become tags. */
  tags: string[];
  seriesName: string;
  seriesPosition: number | null;
  /** The last time it was finished (YYYY-MM-DD), which logs a read that year. */
  dateRead: string | null;
  dateAdded: string | null;
  review: string;
  privateNotes: string;
  owned: boolean;
  kindle: boolean;
  /** A book already in the library that looks like this one. */
  match: { id: number; title: string } | null;
};

const STATUS: Record<string, GoodreadsBook["status"]> = { "to-read": "To Read", "currently-reading": "Currently Reading", read: "Read" };
const ABANDONED = /^(dnf|did-not-finish|abandon(ed)?|gave-up|unfinished|stopped-reading|not-finished)$/i;

/** Goodreads writes ISBNs as ="0316769487" so spreadsheets keep the leading zero. */
const unwrap = (v: string | undefined) => (v ?? "").trim().replace(/^="?/, "").replace(/"$/, "").trim();
const num = (v: string | undefined) => {
  const n = Number(unwrap(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};
/** "2019/03/15" -> "2019-03-15". */
const day = (v: string | undefined) => {
  const d = unwrap(v).replace(/\//g, "-");
  return isDay(d) ? d : null;
};
/** Reviews come as HTML ("<br/>", "<i>"). */
const plain = (html: string | undefined) =>
  (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
/** "science-fiction" -> "Science Fiction". */
const tagName = (shelf: string) => shelf.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/(^|\s)\p{Ll}/gu, (c) => c.toUpperCase());
/** "The Name of the Wind (The Kingkiller Chronicle, #1)" -> the title, and the series and its number. */
function splitSeries(title: string) {
  const m = title.match(/^(.*\S)\s*\(([^()]+?),?\s*#(\d+(?:\.\d+)?)[^()]*\)\s*$/);
  return m ? { title: m[1], series: m[2].trim(), position: Number(m[3]) } : { title, series: "", position: null };
}
/** For spotting the same book: folded title without its subtitle, and the author's last name. */
const sameBookKey = (title: string, author: string) => `${fold(title.split(":")[0])}|${fold(author).split(" ").pop() ?? ""}`;

export function parseGoodreadsCsv(csv: string): GoodreadsBook[] | string {
  let rows: Record<string, string>[];
  try {
    rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
  } catch {
    return "That file couldn’t be read as a CSV.";
  }
  if (!rows.length || !("Exclusive Shelf" in rows[0]) || !("Title" in rows[0])) {
    return "That doesn’t look like a Goodreads export. It should have columns like Title, Author and Exclusive Shelf.";
  }
  return rows
    .map((r, i): GoodreadsBook | null => {
      const raw = (r["Title"] ?? "").trim();
      if (!raw) return null;
      const { title, series, position } = splitSeries(raw);
      const exclusive = (r["Exclusive Shelf"] ?? "").trim().toLowerCase();
      const status = STATUS[exclusive] ?? (ABANDONED.test(exclusive) ? "Abandoned" : null);
      const shelves = (r["Bookshelves"] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && s.toLowerCase() !== exclusive && !STATUS[s.toLowerCase()] && !ABANDONED.test(s));
      // A custom exclusive shelf that isn't a status (rare) is kept as a tag.
      if (!status && exclusive) shelves.unshift(exclusive);
      const rating = num(r["My Rating"]);
      return {
        row: i,
        title,
        author: (r["Author"] ?? "").replace(/\s+/g, " ").trim(),
        additionalAuthors: (r["Additional Authors"] ?? "").trim(),
        isbn13: toIsbn13(unwrap(r["ISBN13"])) ?? toIsbn13(unwrap(r["ISBN"])),
        rating: rating && rating <= 5 ? Math.round(rating) : null,
        publisher: (r["Publisher"] ?? "").trim(),
        pages: num(r["Number of Pages"]),
        publishYear: num(r["Original Publication Year"]) ?? num(r["Year Published"]),
        status,
        tags: [...new Set(shelves.map(tagName))],
        seriesName: series,
        seriesPosition: position,
        dateRead: day(r["Date Read"]),
        dateAdded: day(r["Date Added"]),
        review: plain(r["My Review"]),
        privateNotes: plain(r["Private Notes"]),
        owned: (num(r["Owned Copies"]) ?? 0) > 0,
        kindle: /kindle/i.test(r["Binding"] ?? ""),
        match: null,
      };
    })
    .filter((b): b is GoodreadsBook => b !== null);
}

/** Marks books that look like ones already in the library: the same ISBN, or the same title and author. Shared with the Libby import. */
export async function findMatches<T extends { title: string; author: string; isbn13: string | null; match: { id: number; title: string } | null }>(books: T[]): Promise<T[]> {
  const existing = (await db.prepare("SELECT id, title, author, isbn13 FROM books").all()) as { id: number; title: string; author: string; isbn13: string | null }[];
  const byIsbn = new Map(existing.filter((b) => b.isbn13).map((b) => [b.isbn13!, b]));
  const byKey = new Map(existing.map((b) => [sameBookKey(b.title, b.author), b]));
  return books.map((b) => {
    const found = (b.isbn13 && byIsbn.get(b.isbn13)) || byKey.get(sameBookKey(b.title, b.author));
    return { ...b, match: found ? { id: found.id, title: found.title } : null };
  });
}

/** Adds books from the export. Returns each new book's id and ISBN, for fetching covers. */
export async function importGoodreadsBooks(books: GoodreadsBook[]): Promise<{ id: number; isbn13: string | null }[]> {
  const added: { id: number; isbn13: string | null }[] = [];
  for (const b of books) {
    const year = b.status !== "To Read" && b.dateRead ? Number(b.dateRead.slice(0, 4)) : null;
    const id = await saveBook(null, {
      title: b.title.slice(0, 500),
      author: b.author,
      author_original: "",
      additional_authors: b.additionalAuthors,
      isbn13: b.isbn13,
      rating: b.rating,
      description: "",
      review: b.review,
      spoiler: "",
      quotes: "",
      private_notes: b.privateNotes,
      on_kindle: b.kindle,
      owned: b.owned,
      publisher: b.publisher,
      publish_year: b.publishYear,
      pages: b.pages,
      ol_work: null,
      ol_edition: null,
      borrowed: false,
      library: "",
      due_date: null,
      series_name: b.seriesName,
      series_position: b.seriesPosition,
      years: year ? [year] : [],
      shelves: b.status ? [b.status] : [],
      tags: b.tags,
      recommendedFor: [],
      recommendedBy: [],
    });
    if (year) await db.prepare("UPDATE book_reads SET finished_on = ? WHERE book_id = ?").run(b.dateRead, id);
    if (b.dateAdded) await db.prepare("UPDATE books SET created_at = ? WHERE id = ?").run(`${b.dateAdded} 12:00:00`, id);
    added.push({ id, isbn13: b.isbn13 });
  }
  return added;
}

/** Fetches OpenLibrary's cover for each book's ISBN. Returns how many were found. */
export async function fetchImportedCovers(books: { id: number; isbn13: string }[]): Promise<number> {
  let found = 0;
  const queue = [...books];
  const worker = async () => {
    for (let b = queue.shift(); b; b = queue.shift()) {
      try {
        const data = await fetchCover(`https://covers.openlibrary.org/b/isbn/${b.isbn13}-L.jpg?default=false`);
        if (!data || !(await isUsableImage(data))) continue;
        const name = await saveCover(b.id, data);
        if (!name) continue;
        await setCover(b.id, name);
        found++;
      } catch {
        // Left for the Missing covers page.
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  return found;
}

const str = (v: unknown, max = 100_000) => (typeof v === "string" ? v.slice(0, max) : "");
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Books come back from the browser between preview and import, so their shape is checked again. */
export function cleanGoodreadsBook(v: unknown): GoodreadsBook | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  const title = str(b.title, 500).trim();
  if (!title) return null;
  const status = (["To Read", "Currently Reading", "Read", "Abandoned"] as const).find((s) => s === b.status) ?? null;
  const rating = numOrNull(b.rating);
  return {
    row: numOrNull(b.row) ?? 0,
    title,
    author: str(b.author, 500),
    additionalAuthors: str(b.additionalAuthors, 1000),
    isbn13: toIsbn13(str(b.isbn13, 20)),
    rating: rating && rating >= 1 && rating <= 5 ? Math.round(rating) : null,
    publisher: str(b.publisher, 500),
    pages: numOrNull(b.pages),
    publishYear: numOrNull(b.publishYear),
    status,
    tags: Array.isArray(b.tags) ? b.tags.map((t) => str(t, 100).trim()).filter(Boolean).slice(0, 50) : [],
    seriesName: str(b.seriesName, 500),
    seriesPosition: numOrNull(b.seriesPosition),
    dateRead: isDay(b.dateRead) ? b.dateRead : null,
    dateAdded: isDay(b.dateAdded) ? b.dateAdded : null,
    review: str(b.review),
    privateNotes: str(b.privateNotes),
    owned: b.owned === true,
    kindle: b.kindle === true,
    match: null,
  };
}
