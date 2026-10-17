import { inventaireByIsbn, searchInventaire } from "./inventaire";
import { searchLoc } from "./loc";
import { looksLikeIsbn, toIsbn13 } from "./names";
import { searchOpenLibrary, type OLDetails, type OLResult } from "./openlibrary";
import { fold } from "./search";

/**
 * Book lookups across open catalogs: OpenLibrary first, then the Library of Congress and Inventaire
 * (which carries Wikidata's books) for what OpenLibrary is missing. All three are openly licensed.
 */
export type Source = "openlibrary" | "loc" | "inventaire";

/** A search result. Results from the other catalogs carry their full details, as there's nothing more to fetch. */
export type LookupResult = OLResult & { source: Source; details?: OLDetails };

const settle = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);

const baseTitle = (t: string) => fold(t.split(":")[0]).replace(/^(the|a|an) /, "");
const sameBook = (a: OLDetails, b: OLDetails) =>
  (a.isbn13 && a.isbn13 === b.isbn13) ||
  (baseTitle(a.title) === baseTitle(b.title) && (!a.author || !b.author || fold(a.author) === fold(b.author)));

function asResult(d: OLDetails, source: Source, i: number): LookupResult {
  return {
    work: `${source}-${i}`,
    edition: null,
    title: d.title,
    authors: [d.author, ...d.additional_authors.split(", ")].filter(Boolean),
    year: d.publish_year,
    isbn13: d.isbn13,
    publisher: d.publisher,
    pages: d.pages,
    coverUrl: d.coverUrl,
    source,
    details: d,
  };
}

/** Library of Congress and Inventaire results, one per book, taking turns (each ranks its own best first). */
export async function searchOtherCatalogs(query: string): Promise<LookupResult[]> {
  const q = query.trim();
  if (!q) return [];
  const isbn = looksLikeIsbn(q) ? toIsbn13(q) : null;
  const [loc, inv] = await Promise.all([
    settle(searchLoc(q, isbn)),
    isbn ? inventaireByIsbn(isbn).then((d) => (d ? [d] : []), () => []) : settle(searchInventaire(q)),
  ]);

  // When both know a book, merge them: LoC for the record, Inventaire for the cover and anything LoC lacks.
  const merged = loc.map((d) => {
    const match = inv.find((i) => sameBook(d, i));
    return match ? fillGaps(d, match) : d;
  });
  const locResults = merged.map((d, i) => asResult(d, "loc", i));
  const invResults = inv.flatMap((d, i) => (loc.some((l) => sameBook(l, d)) ? [] : [asResult(d, "inventaire", i)]));
  const results: LookupResult[] = [];
  for (let i = 0; i < Math.max(locResults.length, invResults.length); i++) results.push(...[locResults[i], invResults[i]].filter((r) => !!r));
  if (isbn) return results;

  // Neither catalog ranks well for a title search, so books with more of the query's words in their title
  // and author come first (sort is stable, so ties keep the catalogs' order).
  const words = fold(q).split(" ");
  const score = (r: LookupResult) => {
    const have = new Set(fold(`${r.title} ${r.authors.join(" ")}`).split(" "));
    return words.filter((w) => have.has(w)).length / words.length + (baseTitle(r.title) === baseTitle(q) ? 1 : 0);
  };
  return results.sort((a, b) => score(b) - score(a)).slice(0, 12);
}

/** OpenLibrary's results, or the other catalogs' when OpenLibrary has nothing or is down. */
export async function searchCatalogs(query: string): Promise<LookupResult[]> {
  const ol = await searchOpenLibrary(query).catch(() => null);
  if (ol?.length) return ol.map((r) => ({ ...r, source: "openlibrary" }));
  const others = await searchOtherCatalogs(query);
  if (!ol && !others.length) throw new Error("OpenLibrary didn't respond");
  return others;
}

/** Fills the empty fields of `d` from `other`; never overwrites. */
export function fillGaps(d: OLDetails, other: OLDetails | null | undefined): OLDetails {
  if (!other) return d;
  return {
    ...d,
    author: d.author || other.author,
    additional_authors: d.additional_authors || other.additional_authors,
    isbn13: d.isbn13 ?? other.isbn13,
    description: d.description || other.description,
    publisher: d.publisher || other.publisher,
    publish_year: d.publish_year ?? other.publish_year,
    pages: d.pages ?? other.pages,
    coverUrl: d.coverUrl ?? other.coverUrl,
  };
}

const hasGaps = (d: OLDetails) => !d.description || !d.publisher || !d.publish_year || !d.pages || !d.coverUrl;

/**
 * An edition's details from the Library of Congress and Inventaire, merged, for filling what
 * OpenLibrary is missing. Null when neither knows the ISBN or both are unreachable.
 */
export async function otherCatalogsByIsbn(isbn: string): Promise<OLDetails | null> {
  const [loc, inv] = await Promise.all([
    searchLoc(isbn, isbn).then((r) => r[0] ?? null, () => null),
    inventaireByIsbn(isbn).catch(() => null),
  ]);
  return loc ? fillGaps(loc, inv) : inv;
}

/** `d` with its empty fields filled from the other catalogs, when it has an ISBN and something is missing. */
export async function withOtherCatalogs(d: OLDetails): Promise<OLDetails> {
  if (!d.isbn13 || !hasGaps(d)) return d;
  return fillGaps(d, await otherCatalogsByIsbn(d.isbn13));
}
