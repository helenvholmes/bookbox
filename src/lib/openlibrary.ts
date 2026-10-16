import { USER_AGENT } from "./covers";
import { looksLikeIsbn, toIsbn13 } from "./names";

const OL = "https://openlibrary.org";

export type OLResult = {
  work: string;
  edition: string | null;
  title: string;
  authors: string[];
  year: number | null;
  isbn13: string | null;
  publisher: string;
  pages: number | null;
  coverUrl: string | null;
};

export type OLDetails = {
  title: string;
  author: string;
  additional_authors: string;
  isbn13: string | null;
  description: string;
  publisher: string;
  publish_year: number | null;
  pages: number | null;
  coverUrl: string | null;
  ol_work: string;
  ol_edition: string | null;
  /** The edition's free-text series label, when OpenLibrary has one. */
  series: string | null;
};

async function get<T>(pathAndQuery: string, attempt = 1): Promise<T | null> {
  try {
    const res = await fetch(OL + pathAndQuery, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`OpenLibrary ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    // OpenLibrary is often slow or briefly down; one retry smooths most of it over.
    if (attempt < 2) return get<T>(pathAndQuery, attempt + 1);
    throw err;
  }
}

/** OpenLibrary has placeholder page counts like 1; anything under 20 isn't a real book length. */
const pagesOrNull = (n: number | undefined | null) => (n && n >= 20 ? n : null);

const coverFromId = (id: number | undefined | null) => (id && id > 0 ? `https://covers.openlibrary.org/b/id/${id}-L.jpg` : null);

/** OpenLibrary stores many titles in sentence case ("American elsewhere"). */
function tidyTitle(title: string) {
  const words = title.split(" ");
  if (words.length < 2 || /[A-Z]/.test(title.slice(1))) return title;
  const small = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
  return words
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function joinTitle(title: string, subtitle?: string) {
  const t = tidyTitle(title.trim());
  return subtitle ? `${t}: ${tidyTitle(subtitle.trim())}` : t;
}

function firstIsbn13(list: string[] | undefined): string | null {
  for (const raw of list ?? []) {
    const isbn = toIsbn13(raw);
    if (isbn && raw.replace(/-/g, "").length === 13) return isbn;
  }
  for (const raw of list ?? []) {
    const isbn = toIsbn13(raw);
    if (isbn) return isbn;
  }
  return null;
}

function yearFrom(s: string | undefined): number | null {
  const m = s?.match(/\b(1[5-9]\d\d|20\d\d)\b/);
  return m ? Number(m[1]) : null;
}

type SearchDoc = {
  key: string;
  title: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
  publisher?: string[];
  number_of_pages_median?: number;
  editions?: {
    docs: {
      key: string;
      title?: string;
      subtitle?: string;
      cover_i?: number;
      isbn?: string[];
      publisher?: string[];
      publish_date?: string[];
      number_of_pages?: number;
    }[];
  };
};

const SEARCH_FIELDS = [
  "key", "title", "subtitle", "author_name", "first_publish_year", "cover_i", "isbn", "publisher", "number_of_pages_median",
  "editions", "editions.key", "editions.title", "editions.subtitle", "editions.cover_i", "editions.isbn",
  "editions.publisher", "editions.publish_date", "editions.number_of_pages",
].join(",");

export async function searchOpenLibrary(query: string): Promise<OLResult[]> {
  const q = query.trim();
  if (!q) return [];
  const isbn = looksLikeIsbn(q) ? toIsbn13(q) : null;
  const params = new URLSearchParams({ q: isbn ? `isbn:${isbn}` : q, fields: SEARCH_FIELDS, limit: "12", lang: "en" });
  const data = await get<{ docs: SearchDoc[] }>(`/search.json?${params}`);

  return (data?.docs ?? []).map((d) => {
    // With an ISBN query, the "best edition" OpenLibrary returns is the matching one.
    const ed = d.editions?.docs[0];
    return {
      work: d.key.replace("/works/", ""),
      edition: ed?.key.replace("/books/", "") ?? null,
      title: joinTitle(ed?.title ?? d.title, ed?.subtitle ?? d.subtitle),
      authors: d.author_name ?? [],
      year: d.first_publish_year ?? null,
      isbn13: isbn ?? firstIsbn13(ed?.isbn) ?? firstIsbn13(d.isbn),
      publisher: ed?.publisher?.[0] ?? d.publisher?.[0] ?? "",
      pages: pagesOrNull(ed?.number_of_pages) ?? pagesOrNull(d.number_of_pages_median),
      coverUrl: coverFromId(ed?.cover_i ?? d.cover_i),
    };
  });
}

type Work = {
  title: string;
  subtitle?: string;
  description?: string | { value: string };
  covers?: number[];
  authors?: { author: { key: string } }[];
  first_publish_date?: string;
};
type Edition = {
  title: string;
  subtitle?: string;
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  isbn_13?: string[];
  isbn_10?: string[];
  covers?: number[];
  description?: string | { value: string };
  works?: { key: string }[];
  series?: string[];
};

function cleanDescription(d: Work["description"]): string {
  const text = typeof d === "string" ? d : (d?.value ?? "");
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\(\[source\]\[\d+\]\)/gi, "")
    .replace(/^\s*\[\d+\]:\s*\S+\s*$/gm, "")
    .replace(/\n-{5,}\n[\s\S]*$/, "") // trailing "See also" link sections
    // Descriptions are Markdown; this app shows plain text.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, "$1$2")
    .trim();
}

/** Full metadata for a work, preferring edition-level details when an edition is known. */
export async function getOpenLibraryDetails(work: string, edition?: string | null): Promise<OLDetails | null> {
  const safe = (k: string | null | undefined) => (k && /^OL\d+[WM]$/.test(k) ? k : null);
  const workKey = safe(work);
  const editionKey = safe(edition);
  if (!workKey) return null;

  const [w, e] = await Promise.all([
    get<Work>(`/works/${workKey}.json`),
    // Only the work is essential; the rest are nice-to-haves that shouldn't fail the lookup.
    editionKey ? get<Edition>(`/books/${editionKey}.json`).catch(() => null) : Promise.resolve(null),
  ]);
  if (!w) return null;

  const authorKeys = (w.authors ?? []).map((a) => a.author?.key).filter(Boolean).slice(0, 4);
  const authors = (await Promise.all(authorKeys.map((k) => get<{ name?: string }>(`${k}.json`).catch(() => null))))
    .map((a) => a?.name)
    .filter((n): n is string => !!n);

  return {
    title: joinTitle(e?.title ?? w.title, e?.subtitle ?? w.subtitle),
    author: authors[0] ?? "",
    additional_authors: authors.slice(1).join(", "),
    isbn13: firstIsbn13(e?.isbn_13) ?? firstIsbn13(e?.isbn_10),
    description: cleanDescription(w.description) || cleanDescription(e?.description),
    publisher: e?.publishers?.[0] ?? "",
    publish_year: yearFrom(e?.publish_date) ?? yearFrom(w.first_publish_date),
    pages: pagesOrNull(e?.number_of_pages),
    coverUrl: coverFromId(e?.covers?.find((c) => c > 0) ?? w.covers?.find((c) => c > 0)),
    ol_work: workKey,
    ol_edition: editionKey,
    series: e?.series?.[0]?.trim() || null,
  };
}

export type CoverCandidate = { url: string; thumb: string; label: string };

type EditionEntry = { covers?: number[]; publishers?: string[]; publish_date?: string; languages?: { key: string }[] };

/**
 * Cover options for a book: the cover for its ISBN (if OpenLibrary has one), then covers from
 * editions of the best-matching works. Up to 12, English editions first.
 */
export async function findCoverCandidates(book: { isbn13: string | null; title: string; author: string }): Promise<CoverCandidate[]> {
  const seen = new Set<string>();
  const out: CoverCandidate[] = [];
  const add = (id: number | undefined, label: string) => {
    if (!id || id <= 0 || seen.has(String(id))) return;
    seen.add(String(id));
    out.push({ url: `https://covers.openlibrary.org/b/id/${id}-L.jpg`, thumb: `https://covers.openlibrary.org/b/id/${id}-M.jpg`, label });
  };

  // Strip series tags and subtitles; they make title searches miss.
  const title = book.title.replace(/\([^)]*#\d+[^)]*\)/g, "").split(":")[0].trim();
  const params = new URLSearchParams({ title, fields: "key,title,author_name,cover_i,first_publish_year", limit: "3" });
  if (book.author) params.set("author", book.author);

  // The ISBN lookup gives the exact edition's cover; the search finds other editions. Run both at once.
  const [ed, search] = await Promise.all([
    book.isbn13 ? get<{ covers?: number[] }>(`/isbn/${book.isbn13}.json`).catch(() => null) : Promise.resolve(null),
    get<{ docs: { key: string; cover_i?: number; first_publish_year?: number }[] }>(`/search.json?${params}`).catch(() => null),
  ]);
  ed?.covers?.forEach((c, i) => add(c, i === 0 ? "Your edition (ISBN match)" : "Your edition"));
  const works = search?.docs ?? [];
  for (const w of works) add(w.cover_i, w.first_publish_year ? `Main cover (${w.first_publish_year})` : "Main cover");

  const editionLists = await Promise.all(
    works.slice(0, 2).map((w) => get<{ entries: EditionEntry[] }>(`${w.key}/editions.json?limit=40`).catch(() => null)),
  );
  const editions = editionLists.flatMap((l) => l?.entries ?? []);
  const english = (e: EditionEntry) => !e.languages || e.languages.some((l) => l.key === "/languages/eng");
  for (const e of [...editions.filter(english), ...editions.filter((e) => !english(e))]) {
    const label = [e.publishers?.[0], yearFrom(e.publish_date)].filter(Boolean).join(", ") || "Another edition";
    e.covers?.forEach((c) => add(c, label));
    if (out.length >= 12) break;
  }
  return out.slice(0, 12);
}

export type IsbnCandidate = { isbn13: string; label: string; thumb: string | null; work: string; edition: string; english: boolean };

type IsbnEdition = EditionEntry & { key: string; isbn_13?: string[]; isbn_10?: string[]; physical_format?: string; title?: string };

/** ISBN prefixes for English-language publishing (978-0, 978-1, 979-8). */
const englishIsbn = (isbn: string) => /^97(80|81|98)/.test(isbn);

/**
 * Editions with an ISBN for a book, from the best-matching works, best first: English (by
 * language, or by an English-market ISBN when no language is recorded), then print over audio or video,
 * then editions with a cover. Up to 12.
 */
export async function findIsbnCandidates(book: { title: string; author: string }): Promise<IsbnCandidate[]> {
  const title = book.title.replace(/\([^)]*#\d+[^)]*\)/g, "").split(":")[0].trim();
  const params = new URLSearchParams({ title, fields: "key", limit: "2" });
  if (book.author) params.set("author", book.author);
  const search = await get<{ docs: { key: string }[] }>(`/search.json?${params}`);
  const lists = await Promise.all(
    (search?.docs ?? []).map((w, rank) =>
      get<{ entries: IsbnEdition[] }>(`${w.key}/editions.json?limit=60`)
        .then((l) => ({ work: w.key, rank, l }))
        .catch(() => null),
    ),
  );

  const scored: (IsbnCandidate & { score: number })[] = [];
  const seen = new Set<string>();
  for (const item of lists) {
    if (!item?.l) continue;
    for (const e of item.l.entries) {
      const isbn = firstIsbn13(e.isbn_13) ?? firstIsbn13(e.isbn_10);
      if (!isbn || seen.has(isbn)) continue;
      seen.add(isbn);
      const langs = (e.languages ?? []).map((l) => l.key);
      const english = langs.length ? langs.includes("/languages/eng") : englishIsbn(isbn);
      const format = (e.physical_format ?? "").toLowerCase();
      const audio = /audio|cd|mp3|video|dvd|vhs/.test(format);
      const cover = e.covers?.find((c) => c > 0);
      const score =
        (english ? 10 : 0) + (englishIsbn(isbn) ? 2 : 0) + (audio ? -6 : 0) + (/paperback|hardcover/.test(format) ? 1 : 0) + (cover ? 1 : 0) - item.rank * 3;
      scored.push({
        isbn13: isbn,
        label: [e.publishers?.[0], yearFrom(e.publish_date), e.physical_format].filter(Boolean).join(" · ") || "Edition",
        thumb: cover ? `https://covers.openlibrary.org/b/id/${cover}-S.jpg` : null,
        work: item.work.replace("/works/", ""),
        edition: e.key.replace("/books/", ""),
        english,
        score,
      });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ score: _score, ...c }) => (void _score, c));
}
