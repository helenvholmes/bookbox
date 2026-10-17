import { USER_AGENT } from "./covers";
import { tidyTitle, type OLDetails } from "./openlibrary";

/**
 * The Library of Congress catalog, through loc.gov's JSON API (no key). Its records are free of
 * copyright restrictions and cover nearly every book published in the US, often with the
 * publisher's summary. There are no covers, and search results don't include ISBNs, though
 * searching by ISBN works. See https://www.loc.gov/apis/json-and-yaml/.
 */
const API = "https://www.loc.gov/books/";

type Item = {
  title?: string;
  description?: string[];
  item?: {
    title?: string;
    contributors?: string[];
    created_published?: string[];
    date?: string;
    medium?: string[];
    language?: string[];
  };
  number_lccn?: string[];
};

/** Relator terms and codes, which catalogers add after names ("author", or "author aut" and a URI). */
const ROLES = /\b(author|aut|joint author|editor|edt|translator|trl|illustrator|ill|narrator|nrt|contributor|ctb|writer of [a-z ]+)\b\.?/g;

/** "Weir, Andy, author" -> "Andy Weir"; "Tolkien, J. R. R. (John Ronald Reuel), 1892-1973, author" -> "J. R. R. Tolkien". */
export function flipName(heading: string): string {
  const parts = heading
    .replace(/https?:\S+/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(ROLES, "")
    .split(",")
    .map((p) => p.trim().replace(/(\p{L}{2,})\.$/u, "$1")) // "John." but "J. R. R."
    .filter((p) => p && !/\d/.test(p));
  const [last, first] = parts;
  return (first ? `${first} ${last}` : (last ?? "")).replace(/\s+/g, " ").trim();
}

const notAnAuthor = (heading: string) => /\b(editor|edt|translator|trl|illustrator|ill|narrator|nrt)\b/.test(heading);

/** "Project Hail Mary : a novel" -> "Project Hail Mary"; "Dune / Frank Herbert." -> "Dune". */
export function locTitle(raw: string): string {
  const [main, ...rest] = raw.replace(/\s*\/.*$/, "").replace(/[.\s]+$/, "").split(/\s+:\s+/);
  const subtitle = rest.join(": ").trim();
  // Library records tag novels and stories; that's not part of the title.
  // Catalog titles are in sentence case ("The ministry of time").
  if (!subtitle || /^an? (novel|memoir|story|novella|thriller|mystery)( in .*)?$/i.test(subtitle)) return tidyTitle(main.trim());
  return `${tidyTitle(main.trim())}: ${tidyTitle(subtitle.charAt(0).toUpperCase() + subtitle.slice(1))}`;
}

/** "New York : Ballantine Books, [2021]" -> "Ballantine Books". */
const publisherFrom = (s: string | undefined) =>
  s
    ?.split(/\s+:\s+/)
    .slice(1)
    .join(" : ")
    .split(/\s*[,;]\s*(?:\[?c?©?\d{4}|\[?date|\[?\d{4})/)[0]
    .replace(/[[\]]/g, "")
    .trim() ?? "";

function yearFrom(s: string | undefined): number | null {
  const m = s?.match(/\b(1[5-9]\d\d|20\d\d)\b/);
  return m ? Number(m[1]) : null;
}

/** The summary, without its quote marks and credit ("-- Provided by publisher.", "--Dust jacket flap."). */
function summary(list: string[] | undefined): string {
  const text = (list ?? []).find((d) => !/^(description based on|includes\b|"?\s*$)/i.test(d.trim())) ?? "";
  return text
    .trim()
    .replace(/\s*--\s*[A-Z][^"\n]{0,60}$/, "")
    .replace(/^"([\s\S]*)"$/, "$1")
    .trim();
}

function toDetails(r: Item, isbn: string | null): OLDetails | null {
  const it = r.item ?? {};
  const rawTitle = it.title ?? r.title;
  if (!rawTitle) return null;
  const people = (it.contributors ?? []).filter((c) => !notAnAuthor(c));
  const names = people.map(flipName).filter(Boolean);
  const pages = Number(it.medium?.join(" ").match(/(\d+)\s+pages/)?.[1]);
  const published = it.created_published?.[0];
  return {
    title: locTitle(rawTitle),
    author: names[0] ?? "",
    additional_authors: names.slice(1, 4).join(", "),
    isbn13: isbn,
    description: summary(r.description),
    publisher: publisherFrom(published),
    publish_year: yearFrom(it.date) ?? yearFrom(published),
    pages: pages >= 20 ? pages : null,
    coverUrl: null,
    ol_work: "",
    ol_edition: null,
    series: null,
  };
}

/** E-books and audio records repeat the print record with less in them. */
const isPrint = (r: Item) => !(r.item?.medium ?? []).some((m) => /online resource|sound|audio|disc/i.test(m));

/** Matching catalog records, print editions first. With an ISBN, only that edition's records. */
export async function searchLoc(query: string, isbn: string | null): Promise<OLDetails[]> {
  const params = new URLSearchParams({ q: isbn ?? query, fo: "json", all: "true", c: "8", fa: "partof:catalog", at: "results" });
  const res = await fetch(`${API}?${params}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    // ISBN searches come back in about a second; a first-time title search can take ten or more.
    signal: AbortSignal.timeout(isbn ? 8_000 : 20_000),
  });
  if (!res.ok) throw new Error(`Library of Congress ${res.status}`);
  const items = ((await res.json()) as { results?: Item[] }).results ?? [];
  const sorted = [...items.filter(isPrint), ...items.filter((r) => !isPrint(r))];

  // One result per book: the same title and author often has a print, e-book and reprint record.
  const out = new Map<string, OLDetails>();
  for (const r of sorted) {
    const d = toDetails(r, isbn);
    if (!d) continue;
    const key = `${d.title.toLowerCase()}|${d.author.toLowerCase()}`;
    const seen = out.get(key);
    if (!seen) out.set(key, d);
    else if (!seen.description && d.description) seen.description = d.description;
  }
  return [...out.values()];
}
