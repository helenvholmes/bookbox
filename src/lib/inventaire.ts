import { USER_AGENT } from "./covers";
import { toIsbn13 } from "./names";
import type { OLDetails } from "./openlibrary";

/**
 * Inventaire (inventaire.io), an open-source book catalog whose data is CC0. Its works and most of
 * its editions are Wikidata's, with the gaps filled in by its users, so it brings Wikidata's books
 * along too. No key needed. See https://api.inventaire.io.
 */
const SITE = "https://inventaire.io";

type Entity = {
  uri: string;
  type?: string;
  labels?: Record<string, string>;
  claims?: Record<string, (string | number)[]>;
  image?: { url?: string };
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(SITE + path, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Inventaire ${res.status}`);
  return (await res.json()) as T;
}

async function byUris(uris: string[], relatives: string[] = []) {
  const params = new URLSearchParams({ uris: uris.join("|") });
  if (relatives.length) params.set("relatives", relatives.join("|"));
  const data = await get<{ entities: Record<string, Entity>; redirects?: Record<string, string> }>(`/api/entities/by-uris?${params}`);
  return { entities: data.entities ?? {}, redirects: data.redirects ?? {} };
}

/** English if there is one, else the label that applies in every language, else any. */
const label = (e: Entity | undefined) => e?.labels?.en ?? e?.labels?.mul ?? Object.values(e?.labels ?? {})[0] ?? "";
const claim = (e: Entity | undefined, p: string) => e?.claims?.[`wdt:${p}`] ?? [];
const first = (e: Entity | undefined, p: string) => claim(e, p)[0];

/** Wikidata's newspaper and journal pieces (articles, editorials, obituaries, reviews) count as works, but aren't books. */
const ARTICLES = new Set(["wd:Q5707594", "wd:Q13442814", "wd:Q191067", "wd:Q871232", "wd:Q309481", "wd:Q265158"]);
const isArticle = (e: Entity | undefined) => claim(e, "P31").some((t) => ARTICLES.has(String(t)));

/** Entity images are covers, served as WebP. */
export const inventaireImage = (e: Entity | undefined) => (e?.image?.url ? SITE + e.image.url : null);

function yearFrom(v: string | number | undefined): number | null {
  const m = String(v ?? "").match(/^(1[5-9]\d\d|20\d\d)/);
  return m ? Number(m[1]) : null;
}

function details(work: Entity | undefined, edition: Entity | undefined, all: Record<string, Entity>, isbn: string | null): OLDetails | null {
  const title = String(first(edition, "P1476") ?? "") || label(edition) || label(work);
  if (!title) return null;
  const subtitle = String(first(edition, "P1680") ?? "");
  const authors = claim(work, "P50").map((u) => label(all[String(u)])).filter(Boolean);
  const pages = Number(first(edition, "P1104"));
  return {
    title: subtitle ? `${title}: ${subtitle}` : title,
    author: authors[0] ?? "",
    additional_authors: authors.slice(1, 4).join(", "),
    isbn13: isbn ?? toIsbn13(String(first(edition, "P212") ?? first(edition, "P957") ?? "")),
    // Wikidata descriptions are one-liners ("2021 novel by Andy Weir"), not blurbs.
    description: "",
    publisher: label(all[String(first(edition, "P123"))]),
    publish_year: yearFrom(first(edition, "P577")) ?? yearFrom(first(work, "P577")),
    pages: pages >= 20 ? pages : null,
    coverUrl: inventaireImage(edition) ?? inventaireImage(work),
    ol_work: "",
    ol_edition: null,
    series: null,
  };
}

/** The edition with this ISBN, with its work, authors and publisher. Null when Inventaire doesn't know it. */
export async function inventaireByIsbn(isbn: string): Promise<OLDetails | null> {
  const { entities, redirects } = await byUris([`isbn:${isbn}`], ["wdt:P629", "wdt:P123"]);
  const edition = entities[redirects[`isbn:${isbn}`] ?? `isbn:${isbn}`];
  if (edition?.type !== "edition") return null;
  const work = entities[String(first(edition, "P629"))];
  const authorUris = claim(work, "P50").map(String).slice(0, 4);
  const authors = authorUris.length ? (await byUris(authorUris).catch(() => ({ entities: {} }))).entities : {};
  return details(work, edition, { ...entities, ...authors }, isbn);
}

/**
 * Works matching a title-and-author search, with their authors. Works carry no edition details
 * (ISBN, publisher, pages), but often a cover and a first-publication year.
 */
export async function searchInventaire(query: string): Promise<OLDetails[]> {
  const params = new URLSearchParams({ types: "works", search: query, lang: "en", limit: "6" });
  const { results = [] } = await get<{ results?: { uri: string; _score: number; image?: string }[] }>(`/api/search?${params}`);
  // Past the close matches, search fills up with popular books that share a word.
  const best = results[0]?._score ?? 0;
  const matches = results.filter((r) => r._score >= best / 10);
  if (!matches.length) return [];
  const { entities } = await byUris(matches.map((r) => r.uri), ["wdt:P50"]);
  return matches
    .filter((r) => !isArticle(entities[r.uri]))
    .map((r) => {
      const d = details(entities[r.uri], undefined, entities, null);
      // Works have no image of their own; search shows one of their editions' covers.
      return d && { ...d, coverUrl: d.coverUrl ?? (r.image ? SITE + r.image : null) };
    })
    .filter((d): d is OLDetails => !!d);
}
