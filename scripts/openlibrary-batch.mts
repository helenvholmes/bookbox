/**
 * Builds an Open Library batch-import file for books Open Library doesn't have yet.
 *
 *   npx tsx scripts/openlibrary-batch.mts <isbns.txt | catalogue.csv> [--out poetry] [--source bookbox] [--publisher "Copper Canyon Press"]
 *
 * Input is either a text file with one ISBN per line (# starts a comment), or a CSV, such as a
 * publisher's backlist spreadsheet, with columns like title, author(s), isbn, publisher,
 * publish_date (or year), pages and description. Column names are matched loosely.
 *
 * For each ISBN it asks Open Library whether the edition exists. Books that exist are skipped.
 * For missing ones, details come from the CSV row, with Google Books filling any gaps (set
 * GOOGLE_BOOKS_API_KEY to avoid its anonymous rate limit). `--publisher` is used when neither
 * source names one.
 *
 * Writes:
 *   <out>.jsonl       one Open Library import record per line, ready for openlibrary.org/import/batch/new
 *   <out>-report.csv  every ISBN with what happened: on Open Library already, ready, or what's missing
 *
 * See docs/openlibrary-bulk-import.md for the rest of the process.
 */
import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { toIsbn13 } from "../src/lib/names";

const USER_AGENT = "BookBox/1.0 (Open Library batch helper; https://github.com/helenvholmes/bookbox)";
const OL = process.env.OPENLIBRARY_URL ?? "https://openlibrary.org";
const GOOGLE = process.env.GOOGLE_BOOKS_URL ?? "https://www.googleapis.com/books/v1";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args.splice(i, 2)[1];
};
const out = flag("out") ?? "openlibrary-batch";
const source = flag("source") ?? "bookbox";
const fallbackPublisher = flag("publisher");
const input = args[0];
if (!input) throw new Error("Usage: openlibrary-batch.mts <isbns.txt | catalogue.csv> [--out name] [--source name] [--publisher name]");

type ImportRecord = {
  title: string;
  subtitle?: string;
  authors: { name: string }[];
  publishers: string[];
  publish_date: string;
  isbn_13: string[];
  number_of_pages?: number;
  languages?: string[];
  description?: string;
  subjects?: string[];
  source_records: string[];
};

type Details = {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publish_date?: string;
  pages?: number;
  language?: string;
  description?: string;
  subjects?: string[];
};

// ---- Reading the input -------------------------------------------------------------------------

function pick(row: Record<string, string>, ...names: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === name);
    if (key && row[key]?.trim()) return row[key].trim();
  }
}

function readInput(file: string): Map<string, Details> {
  const text = fs.readFileSync(file, "utf8");
  const books = new Map<string, Details>();
  const bad: string[] = [];
  if (file.toLowerCase().endsWith(".csv")) {
    const rows = parse(text, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true }) as Record<string, string>[];
    for (const row of rows) {
      const raw = pick(row, "isbn13", "isbn", "ean", "isbn10", "productidentifier");
      const isbn = toIsbn13(raw);
      if (!isbn) {
        bad.push(raw ?? JSON.stringify(row).slice(0, 60));
        continue;
      }
      const authors = pick(row, "authors", "author", "contributors", "contributor", "byline");
      const year = pick(row, "publishdate", "publicationdate", "pubdate", "date", "year", "publishyear");
      const pages = Number(pick(row, "pages", "pagecount", "numberofpages", "extent"));
      books.set(isbn, {
        title: pick(row, "title"),
        subtitle: pick(row, "subtitle"),
        authors: authors?.split(/\s*;\s*|\s*\|\s*|\s+&\s+|\s+and\s+/).filter(Boolean),
        publisher: pick(row, "publisher", "imprint", "publishername"),
        publish_date: year,
        pages: pages > 0 ? pages : undefined,
        language: pick(row, "language", "lang"),
        description: pick(row, "description", "summary", "copy", "maindescription"),
        subjects: pick(row, "subjects", "subject", "bisac", "categories")?.split(/\s*;\s*|\s*\|\s*/).filter(Boolean),
      });
    }
  } else {
    for (const line of text.split(/\r?\n/)) {
      const raw = line.replace(/#.*/, "").trim();
      if (!raw) continue;
      const isbn = toIsbn13(raw);
      if (isbn) books.set(isbn, books.get(isbn) ?? {});
      else bad.push(raw);
    }
  }
  if (bad.length) console.warn(`Skipped ${bad.length} line(s) without a valid ISBN: ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? ", …" : ""}`);
  return books;
}

// ---- Lookups -----------------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, tries = 3): Promise<{ status: number; body: unknown }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      if ((res.status === 429 || res.status >= 500) && attempt < tries) {
        await sleep(2_000 * attempt);
        continue;
      }
      return { status: res.status, body: res.ok ? await res.json() : null };
    } catch (err) {
      if (attempt >= tries) throw err;
      await sleep(2_000 * attempt);
    }
  }
}

/** The Open Library edition key when the ISBN is already there, null when it isn't. */
async function onOpenLibrary(isbn: string): Promise<string | null> {
  const { status, body } = await getJson(`${OL}/isbn/${isbn}.json`);
  if (status === 404) return null;
  if (status !== 200) throw new Error(`Open Library answered ${status} for ${isbn}`);
  return (body as { key?: string }).key ?? "found";
}

type GoogleVolume = {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    pageCount?: number;
    language?: string;
    description?: string;
    categories?: string[];
  };
};

async function fromGoogle(isbn: string): Promise<Details> {
  const key = process.env.GOOGLE_BOOKS_API_KEY ? `&key=${encodeURIComponent(process.env.GOOGLE_BOOKS_API_KEY)}` : "";
  const { status, body } = await getJson(`${GOOGLE}/volumes?q=isbn:${isbn}${key}`);
  if (status === 429) throw new Error("Google Books rate limit: set GOOGLE_BOOKS_API_KEY and run again.");
  const info = (body as { items?: GoogleVolume[] } | null)?.items?.[0]?.volumeInfo;
  if (!info) return {};
  return {
    title: info.title,
    subtitle: info.subtitle,
    authors: info.authors,
    publisher: info.publisher,
    publish_date: info.publishedDate,
    pages: info.pageCount,
    language: info.language,
    description: info.description,
    subjects: info.categories,
  };
}

// ---- Building records --------------------------------------------------------------------------

/** Open Library wants MARC language codes; these are the ones poetry lists mostly need. */
const LANGUAGES: Record<string, string> = {
  en: "eng", eng: "eng", english: "eng",
  es: "spa", spa: "spa", spanish: "spa",
  fr: "fre", fre: "fre", french: "fre",
  de: "ger", ger: "ger", german: "ger",
  it: "ita", ita: "ita", italian: "ita",
  pt: "por", por: "por", portuguese: "por",
  ga: "gle", gle: "gle", irish: "gle",
  cy: "wel", wel: "wel", welsh: "wel",
  zh: "chi", chi: "chi", chinese: "chi",
  ja: "jpn", jpn: "jpn", japanese: "jpn",
  ar: "ara", ara: "ara", arabic: "ara",
};

/** Fills gaps in `a` from `b`. */
function merge(a: Details, b: Details): Details {
  const merged: Details = { ...b };
  for (const [k, v] of Object.entries(a)) if (v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)) (merged as Record<string, unknown>)[k] = v;
  return merged;
}

const complete = (p: Details) => !!(p.title && p.authors?.length && p.publisher && p.publish_date);

function toRecord(isbn: string, p: Details, sourceName: string): { record?: ImportRecord; missing: string[] } {
  const missing = [
    !p.title && "title",
    !p.authors?.length && "authors",
    !p.publisher && "publisher",
    !p.publish_date && "publish_date",
  ].filter((m): m is string => !!m);
  if (missing.length) return { missing };
  const record: ImportRecord = {
    title: p.title!,
    authors: p.authors!.map((name) => ({ name: name.trim() })),
    publishers: [p.publisher!],
    publish_date: p.publish_date!,
    isbn_13: [isbn],
    source_records: [`${sourceName}:${isbn}`],
  };
  if (p.subtitle) record.subtitle = p.subtitle;
  if (p.pages && p.pages >= 20) record.number_of_pages = p.pages;
  const lang = p.language && LANGUAGES[p.language.toLowerCase()];
  if (lang) record.languages = [lang];
  if (p.description) record.description = p.description;
  if (p.subjects?.length) record.subjects = p.subjects;
  return { record, missing };
}

// ---- Main --------------------------------------------------------------------------------------

const books = readInput(input);
console.log(`Checking ${books.size} ISBN(s) against Open Library…`);

const records: ImportRecord[] = [];
const report: string[][] = [["isbn13", "status", "detail"]];
let done = 0;
for (const [isbn, given] of books) {
  done++;
  try {
    const existing = await onOpenLibrary(isbn);
    if (existing) {
      report.push([isbn, "on Open Library", existing]);
    } else {
      let details = given;
      if (!complete(details)) details = merge(details, await fromGoogle(isbn));
      if (!details.publisher && fallbackPublisher) details.publisher = fallbackPublisher;
      const { record, missing } = toRecord(isbn, details, source);
      if (record) {
        records.push(record);
        report.push([isbn, "ready", `${record.title} by ${record.authors.map((a) => a.name).join(", ")}`]);
      } else {
        report.push([isbn, "needs details", `missing ${missing.join(", ")}${details.title ? ` (${details.title})` : ""}`]);
      }
    }
  } catch (err) {
    report.push([isbn, "error", (err as Error).message]);
    if ((err as Error).message.includes("GOOGLE_BOOKS_API_KEY")) {
      console.error((err as Error).message);
      break;
    }
  }
  if (done % 25 === 0) console.log(`  ${done}/${books.size}`);
  await sleep(400); // Stay well under Open Library's rate limits.
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
fs.writeFileSync(`${out}.jsonl`, records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : ""));
fs.writeFileSync(`${out}-report.csv`, report.map((row) => row.map(csvCell).join(",")).join("\n") + "\n");

const count = (status: string) => report.filter((r) => r[1] === status).length;
console.log(
  `\nAlready on Open Library: ${count("on Open Library")}\nReady to import: ${count("ready")} -> ${out}.jsonl\n` +
    `Need details by hand: ${count("needs details")}\nErrors: ${count("error")}\nFull list: ${out}-report.csv`,
);
