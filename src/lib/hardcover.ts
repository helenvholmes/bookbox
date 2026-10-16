import "server-only";
import { saveBook, setCover } from "./books";
import { fetchCover, isUsableImage, saveCover, USER_AGENT } from "./covers";
import { db, transaction } from "./db";
import { getOpenLibraryDetails, searchOpenLibrary } from "./openlibrary";
import { fold } from "./search";

/**
 * Hardcover (hardcover.app) knows every book in a series, including the ones you don't have.
 * Its API needs a personal token, pasted into Settings (or set as HARDCOVER_TOKEN on the host),
 * and only works from the server. See https://docs.hardcover.app/api/getting-started/.
 */
const API = "https://api.hardcover.app/v1/graphql";

export async function hardcoverToken(): Promise<{ token: string; from: "environment" | "settings" } | null> {
  if (process.env.HARDCOVER_TOKEN) return { token: process.env.HARDCOVER_TOKEN, from: "environment" };
  const row = (await db.prepare("SELECT value FROM settings WHERE key = 'hardcover_token'").get()) as { value: string } | undefined;
  return row?.value ? { token: row.value, from: "settings" } : null;
}

/** Saves the token from Settings (null clears it). It's never sent back to the page. */
export async function saveHardcoverToken(token: string | null) {
  await transaction(async () => {
    await db.exec("DELETE FROM settings WHERE key = 'hardcover_token'");
    if (token) await db.prepare("INSERT INTO settings (key, value) VALUES ('hardcover_token', ?)").run(token);
  });
}

export class HardcoverError extends Error {}

async function query<T>(token: string, gql: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Hardcover shows the token with "Bearer " in front; accept it pasted either way.
      authorization: /^bearer /i.test(token) ? token : `Bearer ${token}`,
      "user-agent": USER_AGENT,
    },
    body: JSON.stringify({ query: gql, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401) throw new HardcoverError("Hardcover didn’t accept the token. It may have expired: make a new one and paste it in Settings.");
  if (res.status === 429) throw new HardcoverError("Hardcover is busy right now. Try again in a minute.");
  if (!res.ok) throw new HardcoverError(`Hardcover answered ${res.status}.`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length || !json.data) throw new HardcoverError(json.errors?.[0]?.message ?? "Hardcover sent an empty answer.");
  return json.data;
}

export type SeriesEntry = {
  position: number | null;
  title: string;
  author: string;
  year: number | null;
  image: string | null;
  isbn13: string | null;
  url: string;
};

type Hit = { document: { id: string | number; name: string; author_name?: string | null; books_count?: number } };
type BookHit = {
  document: { title: string; author_names?: string[]; featured_series?: { series?: { id: number; books_count?: number } | null } | null };
};

const SEARCH = `query ($q: String!) { search(query: $q, query_type: "Series", per_page: 10, page: 1) { results } }`;
const BOOK_SEARCH = `query ($q: String!) { search(query: $q, query_type: "Book", per_page: 5, page: 1) { results } }`;

// One book per position, most popular first, without merged duplicates, partial books or box sets
// (https://docs.hardcover.app/api/guides/gettingbooksinseries/).
const BOOKS = `query ($id: Int!) {
  series_by_pk(id: $id) {
    slug
    book_series(
      distinct_on: position
      order_by: [{ position: asc }, { book: { users_count: desc } }]
      where: { compilation: { _eq: false }, book: { canonical_id: { _is_null: true }, is_partial_book: { _eq: false } } }
    ) {
      position
      book {
        slug
        title
        release_year
        cached_image
        contributions(limit: 1) { author { name } }
        default_physical_edition { isbn_13 }
      }
    }
  }
}`;

type BooksData = {
  series_by_pk: {
    slug: string;
    book_series: {
      position: number | null;
      book: {
        slug: string;
        title: string;
        release_year: number | null;
        cached_image: { url?: string } | null;
        contributions: { author: { name: string } | null }[];
        default_physical_edition: { isbn_13: string | null } | null;
      };
    }[];
  } | null;
};

const lastName = (name: string) => fold(name).split(" ").pop() ?? "";

/** Series names compared loosely: "Monk & Robot" is "Monk and Robot". */
const seriesKey = (name: string) => fold(name.replace(/&/g, " and "));

/**
 * Finds a series on Hardcover: the hit with the same name and an author you have in it, falling
 * back to any hit by one of those authors. Hardcover's empty placeholder series are skipped.
 * When the name finds nothing ("Off Campus" is "Off-Campus" there), one of your books in the series
 * is looked up instead and its series used. Null when nothing fits, rather than a guess at a
 * different series.
 */
async function searchSeries(token: string, name: string, authors: string[], title: string | null): Promise<number | null> {
  const surnames = new Set(authors.map(lastName).filter(Boolean));
  const byAuthor = (names: string) => !surnames.size || fold(names).split(" ").some((w) => surnames.has(w));

  const { search } = await query<{ search: { results: { hits?: Hit[] } | null } }>(token, SEARCH, { q: name });
  const hits = (search.results?.hits ?? []).filter((h) => h.document.books_count !== 0 && byAuthor(h.document.author_name ?? ""));
  const hit = hits.find((h) => seriesKey(h.document.name) === seriesKey(name)) ?? hits[0];
  if (hit) return Number(hit.document.id);
  if (!title) return null;

  const books = await query<{ search: { results: { hits?: BookHit[] } | null } }>(token, BOOK_SEARCH, { q: `${title.split(/[:(\[]/)[0].trim()} ${authors[0] ?? ""}` });
  const book = (books.search.results?.hits ?? []).find(
    (h) => baseTitle(h.document.title) === baseTitle(title) && byAuthor((h.document.author_names ?? []).join(" ")),
  );
  const series = book?.document.featured_series?.series;
  return series && series.books_count !== 0 ? series.id : null;
}

/** Checks a token works with one search, throwing HardcoverError when it doesn't. */
export async function checkHardcoverToken(token: string) {
  await query(token, SEARCH, { q: "Harry Potter" });
}

type Unchecked = { id: number; name: string; authors: string | null; title: string | null };

const seriesAuthors = (r: Unchecked) => (r.authors ?? "").split("|").filter(Boolean);

async function lookUp(token: string, r: Unchecked): Promise<number | null> {
  const id = await searchSeries(token, r.name, seriesAuthors(r), r.title);
  await db.prepare("UPDATE series SET hardcover_id = ?, hardcover_checked_at = datetime('now') WHERE id = ?").run(id, r.id);
  return id;
}

const UNCHECKED = `SELECT s.id, s.name,
    (SELECT group_concat(b.author, '|') FROM book_series x JOIN books b ON b.id = x.book_id WHERE x.series_id = s.id) AS authors,
    (SELECT b.title FROM book_series x JOIN books b ON b.id = x.book_id WHERE x.series_id = s.id ORDER BY x.position IS NULL, x.position LIMIT 1) AS title
  FROM series s WHERE s.hardcover_checked_at IS NULL`;

/**
 * Looks up series that haven't been checked on Hardcover yet, a few at a time so a visit stays
 * within Hardcover's burst limit (10 requests; each series takes one or two). Stops quietly on any
 * error; the next visit carries on.
 */
export async function checkSeriesOnHardcover(limit = 4) {
  const auth = await hardcoverToken();
  if (!auth) return;
  const rows = (await db.prepare(`${UNCHECKED} ORDER BY s.name COLLATE NOCASE LIMIT ?`).all(limit)) as Unchecked[];
  for (const r of rows) {
    try {
      await lookUp(auth.token, r);
    } catch {
      return;
    }
  }
}

/** The whole series on Hardcover for one of yours, looked up once and remembered. Null when Hardcover doesn't have it. */
export async function hardcoverSeries(seriesId: number): Promise<{ url: string; books: SeriesEntry[] } | null> {
  const auth = await hardcoverToken();
  if (!auth) return null;
  const row = (await db.prepare("SELECT hardcover_id, hardcover_checked_at FROM series WHERE id = ?").get(seriesId)) as
    | { hardcover_id: number | null; hardcover_checked_at: string | null }
    | undefined;
  if (!row) return null;
  let id = row.hardcover_id;
  if (!row.hardcover_checked_at) {
    const r = (await db.prepare(`${UNCHECKED} AND s.id = ?`).get(seriesId)) as Unchecked | undefined;
    id = r ? await lookUp(auth.token, r) : null;
  }
  if (id == null) return null;

  const { series_by_pk: series } = await query<BooksData>(auth.token, BOOKS, { id });
  if (!series) return null;
  return {
    url: `https://hardcover.app/series/${series.slug}`,
    books: series.book_series.map(({ position, book }) => ({
      position,
      title: book.title,
      author: book.contributions[0]?.author?.name ?? "",
      // Some books have nonsense years ("8"); leave those out.
      year: book.release_year && book.release_year >= 1000 ? book.release_year : null,
      image: book.cached_image?.url ?? null,
      isbn13: book.default_physical_edition?.isbn_13 ?? null,
      url: `https://hardcover.app/books/${book.slug}`,
    })),
  };
}

const baseTitle = (title: string) => fold(title.split(/[:(\[]/)[0]);

/** Titles to compare: the whole title, and the part after a series prefix ("Lockwood & Co: The Screaming Staircase"). */
const titleKeys = (title: string) => [baseTitle(title), fold(title.split(":").slice(1).join(":").split(/[(\[]/)[0])].filter(Boolean);

/**
 * The series' books that aren't in your library: not at a place in the series you've already
 * filled (`positions`), and not matched by ISBN or by title and author.
 */
export async function missingFromLibrary(entries: SeriesEntry[], positions: (number | null)[] = []): Promise<SeriesEntry[]> {
  const filled = new Set(positions.filter((p) => p != null));
  const books = (await db.prepare("SELECT title, author, additional_authors, isbn13 FROM books").all()) as {
    title: string;
    author: string;
    additional_authors: string;
    isbn13: string | null;
  }[];
  const isbns = new Set(books.map((b) => b.isbn13).filter(Boolean));
  return entries.filter((e) => {
    if ((e.position != null && filled.has(e.position)) || (e.isbn13 && isbns.has(e.isbn13))) return false;
    const keys = titleKeys(e.title);
    return !books.some(
      (b) =>
        titleKeys(b.title).some((k) => keys.includes(k)) && (!e.author || fold(`${b.author} ${b.additional_authors}`).split(" ").includes(lastName(e.author))),
    );
  });
}

/** Downloads a cover from Hardcover's image host, for books OpenLibrary has no cover for. */
async function fetchHardcoverImage(url: string): Promise<Buffer | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !(parsed.hostname === "hardcover.app" || parsed.hostname.endsWith(".hardcover.app"))) return null;
  const res = await fetch(parsed, { redirect: "error", headers: { "User-Agent": USER_AGENT } }).catch(() => null);
  return res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

/** Adds a book from a Hardcover series to To Read, in your series at its place, filled in from OpenLibrary where it can be. */
export async function addSeriesBook(seriesName: string, e: SeriesEntry): Promise<number> {
  const match = (await searchOpenLibrary(e.isbn13 ?? `${e.title} ${e.author}`).catch(() => [])).find(
    (r) => (e.isbn13 && r.isbn13 === e.isbn13) || baseTitle(r.title) === baseTitle(e.title),
  );
  const details = match ? await getOpenLibraryDetails(match.work, match.edition).catch(() => null) : null;
  const bookId = await saveBook(null, {
    title: e.title,
    author: e.author || details?.author || match?.authors[0] || "",
    author_original: "",
    additional_authors: details?.additional_authors ?? "",
    isbn13: e.isbn13 ?? details?.isbn13 ?? match?.isbn13 ?? null,
    rating: null,
    description: details?.description ?? "",
    review: "",
    spoiler: "",
    quotes: "",
    private_notes: "",
    on_kindle: false,
    owned: false,
    publisher: details?.publisher || match?.publisher || "",
    publish_year: e.year ?? details?.publish_year ?? match?.year ?? null,
    pages: details?.pages ?? match?.pages ?? null,
    ol_work: match?.work ?? null,
    ol_edition: details?.ol_edition ?? match?.edition ?? null,
    borrowed: false,
    library: "",
    due_date: null,
    series_name: seriesName,
    series_position: e.position,
    years: [],
    shelves: ["To Read"],
    tags: [],
    recommendedFor: [],
    recommendedBy: [],
  });

  const coverUrl = details?.coverUrl ?? match?.coverUrl;
  const image = (coverUrl ? await fetchCover(coverUrl).catch(() => null) : null) ?? (e.image ? await fetchHardcoverImage(e.image) : null);
  if (image && (await isUsableImage(image))) {
    const name = await saveCover(bookId, image);
    if (name) await setCover(bookId, name);
  }
  return bookId;
}
