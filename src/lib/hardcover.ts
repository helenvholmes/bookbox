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

type Hit = { document: { id: string | number; name: string; author_name?: string | null } };

const SEARCH = `query ($q: String!) { search(query: $q, query_type: "Series", per_page: 10, page: 1) { results } }`;

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

/**
 * The whole series on Hardcover for one of yours: the hit with the same name and an author you have
 * in it, falling back to any hit by one of those authors. Null when Hardcover has nothing that fits,
 * rather than a guess at a different series.
 */
export async function hardcoverSeries(name: string, authors: string[]): Promise<{ url: string; books: SeriesEntry[] } | null> {
  const auth = await hardcoverToken();
  if (!auth) return null;
  const { search } = await query<{ search: { results: { hits?: Hit[] } | null } }>(auth.token, SEARCH, { q: name });
  const surnames = new Set(authors.map(lastName).filter(Boolean));
  const byAuthor = (h: Hit) => !surnames.size || fold(h.document.author_name ?? "").split(" ").some((w) => surnames.has(w));
  const hits = search.results?.hits ?? [];
  const hit = hits.find((h) => fold(h.document.name) === fold(name) && byAuthor(h)) ?? hits.find(byAuthor);
  if (!hit) return null;

  const { series_by_pk: series } = await query<BooksData>(auth.token, BOOKS, { id: Number(hit.document.id) });
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
