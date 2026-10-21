/**
 * Preloaded into the test server (NODE_OPTIONS=--import) so it never reaches the real catalogs:
 * OpenLibrary, its cover server, Inventaire and the Library of Congress answer from the fixtures
 * below, and anything else off this machine fails as if offline. Requests to the server itself pass.
 *
 * Cover id 666 is OpenLibrary's cover server being down: the connection resets.
 */
import sharp from "sharp";
import { BOOKS } from "./fixtures.mjs";

const realFetch = globalThis.fetch;
const cover = await sharp({ create: { width: 60, height: 90, channels: 3, background: "#b4532a" } }).jpeg().toBuffer();

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const notFound = () => json({ error: "not found" }, 404);
const reset = () => {
  throw new TypeError("fetch failed", { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) });
};

function openLibrary(url) {
  const p = url.pathname;
  if (p === "/search.json") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase().replace(/^isbn:/, "");
    const docs = BOOKS.filter((b) => b.title.toLowerCase().includes(q) || b.isbn === q).map((b) => ({
      key: `/works/${b.work}`,
      title: b.title,
      author_name: [b.author],
      first_publish_year: b.year,
      cover_i: b.coverId,
      editions: { docs: [{ key: `/books/${b.edition}`, title: b.title, cover_i: b.coverId, isbn: [b.isbn], publisher: [b.publisher], number_of_pages: b.pages }] },
    }));
    return json({ docs });
  }
  const book = BOOKS.find((b) => p === `/works/${b.work}.json` || p === `/books/${b.edition}.json` || p === `/authors/${b.authorKey}.json`);
  if (!book) return notFound();
  if (p.startsWith("/works/"))
    return json({ title: book.title, description: book.description, covers: [book.coverId], authors: [{ author: { key: `/authors/${book.authorKey}` } }], first_publish_date: String(book.year) });
  if (p.startsWith("/books/"))
    return json({ title: book.title, publishers: [book.publisher], publish_date: String(book.year), number_of_pages: book.pages, isbn_13: [book.isbn], covers: [book.coverId], works: [{ key: `/works/${book.work}` }] });
  return json({ name: book.author });
}

function inventaire(url) {
  if (url.pathname.startsWith("/img/")) return new Response(cover, { headers: { "Content-Type": "image/jpeg" } });
  if (url.pathname === "/api/entities/by-uris") {
    const isbn = url.searchParams.get("uris")?.replace(/^isbn:/, "");
    const book = BOOKS.find((b) => b.isbn === isbn && b.inventaireCover);
    if (!book) return json({ entities: {} });
    return json({ entities: { [`isbn:${isbn}`]: { uri: `isbn:${isbn}`, type: "edition", labels: { en: book.title }, claims: {}, image: { url: `/img/entities/${isbn}` } } } });
  }
  return json({ results: [] });
}

function route(url) {
  switch (url.hostname) {
    case "openlibrary.org":
      return openLibrary(url);
    case "covers.openlibrary.org":
      if (url.pathname.includes("/666-")) return reset();
      return new Response(cover, { headers: { "Content-Type": "image/jpeg" } });
    case "inventaire.io":
      return inventaire(url);
    case "www.loc.gov":
      return json({ results: [] });
    default:
      return reset();
  }
}

globalThis.fetch = async function stubbedFetch(input, init) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return realFetch(input, init);
  const res = await route(url);
  // fetchCover checks where redirects ended up.
  Object.defineProperty(res, "url", { value: url.href });
  return res;
};
