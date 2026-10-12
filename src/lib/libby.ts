import { parse } from "csv-parse/browser/esm/sync";
import { isDay, todayLocal } from "./dates";
import { toIsbn13 } from "./names";
import { fold } from "./search";

/**
 * Reading a Libby timeline export (Shelf → Timeline → Actions → Export Timeline), as the
 * Spreadsheet (CSV) or Data (JSON) file. The timeline is a list of events (borrowed, returned,
 * placed a hold…), so they're gathered into one book per title. Runs in the browser, so each
 * event lands on the reader's own day; the server checks the books again before adding them.
 *
 * Libby doesn't record whether you finished a book, only when you returned it, so returned books
 * come in as read on the day you returned them unless you mark them as not finished.
 */

export type LibbyStatus = "Currently Reading" | "Read" | "Abandoned" | "To Read";

export type LibbyBook = {
  /** Position in the preview, to pick books by. */
  row: number;
  title: string;
  author: string;
  publisher: string;
  isbn13: string | null;
  /** Libby's cover image (OverDrive's CDN), tried before OpenLibrary. */
  coverUrl: string | null;
  library: string;
  status: LibbyStatus;
  /** First time it shows up in the timeline (YYYY-MM-DD), used as the date added. */
  firstSeen: string | null;
  /** The last return (YYYY-MM-DD): the finish date for a read book. */
  returnedOn: string | null;
  /** A book already in the library that looks like this one. */
  match: { id: number; title: string } | null;
};

type LibbyEvent = { key: string; title: string; author: string; publisher: string; isbn: string; cover: string; library: string; activity: string; at: number };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Timestamps come as epoch milliseconds (JSON) or as text (CSV): ISO, "6/12/2023 7:42 PM" or
 * "June 12, 2023 07:42". Parsed by hand so every browser reads them the same way.
 */
function toTime(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (/^\d{9,13}$/.test(s)) return toTime(Number(s));
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const t = Date.parse(s.length === 10 ? `${s}T12:00:00` : s);
    return Number.isNaN(t) ? null : t;
  }
  let y: number, mo: number, d: number, rest: string;
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(.*)$/);
  const named = s.match(/^(?:[A-Za-z]+,?\s+)?([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})(.*)$/);
  if (slash) [mo, d, y, rest] = [Number(slash[1]), Number(slash[2]), Number(slash[3]), slash[4]];
  else if (named && MONTHS.includes(named[1].slice(0, 3).toLowerCase()))
    [mo, d, y, rest] = [MONTHS.indexOf(named[1].slice(0, 3).toLowerCase()) + 1, Number(named[2]), Number(named[3]), named[4]];
  else return null;
  if (y < 100) y += 2000;
  const time = rest.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/);
  let h = time ? Number(time[1]) : 12;
  if (time?.[4]) h = (h % 12) + (/p/i.test(time[4]) ? 12 : 0);
  const date = new Date(y, mo - 1, d, h, time ? Number(time[2]) : 0, time?.[3] ? Number(time[3]) : 0);
  return Number.isNaN(date.getTime()) || date.getMonth() !== mo - 1 ? null : date.getTime();
}

const text = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  // The JSON export nests some fields: { text, url }.
  if (v && typeof v === "object" && "text" in v) return text((v as { text: unknown }).text);
  return "";
};
const url = (v: unknown): string => {
  if (typeof v === "string") return /^https:\/\//.test(v.trim()) ? v.trim() : "";
  if (v && typeof v === "object" && "url" in v) return url((v as { url: unknown }).url);
  return "";
};

/** Column names vary a little between exports ("Title" or "title", "Date" or "Timestamp"), so they're matched loosely. */
function pick(row: Record<string, unknown>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const k = keys.find((key) => key.trim().toLowerCase().replace(/[\s_]+/g, "") === name);
    if (k !== undefined && row[k] !== "" && row[k] != null) return row[k];
  }
  return undefined;
}

function toEvent(row: Record<string, unknown>): LibbyEvent | null {
  const titleField = pick(row, "title");
  const title = text(titleField);
  const at = toTime(pick(row, "timestamp", "date", "time", "datetime"));
  if (!title || at === null) return null;
  const author = text(pick(row, "author", "authors", "creator")).replace(/\s+/g, " ");
  const isbn = text(pick(row, "isbn", "isbn13"));
  // Libby's own id for the title, from the JSON's titleId or a libbyapp.com/…/title/123 link.
  const titleId =
    text(titleField && typeof titleField === "object" ? (titleField as { titleId?: unknown }).titleId : undefined) ||
    text(pick(row, "titleid")) ||
    (url(titleField) || text(pick(row, "titleurl", "url", "link"))).match(/\/title\/(\d+)/)?.[1] ||
    "";
  return {
    key: titleId ? `id:${titleId}` : toIsbn13(isbn) ? `isbn:${toIsbn13(isbn)}` : `name:${fold(title)}|${fold(author)}`,
    title,
    author,
    publisher: text(pick(row, "publisher")),
    isbn,
    cover: url(pick(row, "cover", "coverurl", "image")),
    library: text(pick(row, "library", "libraryname")),
    activity: text(pick(row, "activity", "action", "event", "type")).toLowerCase(),
    at,
  };
}

function readRows(file: string): Record<string, unknown>[] | string {
  const trimmed = file.replace(/^﻿/, "").trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const data = JSON.parse(trimmed) as unknown;
      const list = Array.isArray(data) ? data : (data as { timeline?: unknown })?.timeline;
      return Array.isArray(list) ? list.filter((r): r is Record<string, unknown> => !!r && typeof r === "object") : "That file doesn’t have a Libby timeline in it.";
    } catch {
      return "That file couldn’t be read.";
    }
  }
  try {
    return parse(trimmed, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true }) as Record<string, string>[];
  } catch {
    return "That file couldn’t be read as a CSV.";
  }
}

export function parseLibbyTimeline(file: string): LibbyBook[] | string {
  const rows = readRows(file);
  if (typeof rows === "string") return rows;
  const events = rows.map(toEvent).filter((e): e is LibbyEvent => e !== null);
  if (!events.length) {
    return rows.length
      ? "That doesn’t look like a Libby timeline. It should have columns like Title, Author, Activity and Timestamp."
      : "There are no books in that file.";
  }

  const byBook = new Map<string, LibbyEvent[]>();
  for (const e of events) byBook.set(e.key, [...(byBook.get(e.key) ?? []), e]);

  const day = (t: number | undefined) => (t === undefined ? null : todayLocal(new Date(t)));
  const books: LibbyBook[] = [];
  for (const list of byBook.values()) {
    list.sort((a, b) => a.at - b.at);
    const lastBorrow = list.findLast((e) => /borrow|renew/.test(e.activity));
    const lastReturn = list.findLast((e) => /return/.test(e.activity));
    const status: LibbyStatus = lastBorrow && (!lastReturn || lastBorrow.at > lastReturn.at) ? "Currently Reading" : lastReturn ? "Read" : "To Read";
    // Later events (and the JSON's fuller fields) are the better source for details.
    const latest = (f: "author" | "publisher" | "isbn" | "cover" | "library") => list.findLast((e) => e[f])?.[f] ?? "";
    books.push({
      row: books.length,
      title: list[list.length - 1].title,
      author: latest("author"),
      publisher: latest("publisher"),
      isbn13: toIsbn13(latest("isbn")),
      coverUrl: latest("cover") || null,
      library: (lastBorrow ?? list[list.length - 1]).library || latest("library"),
      status,
      firstSeen: day(list[0].at),
      returnedOn: status === "Read" ? day(lastReturn?.at) : null,
      match: null,
    });
  }
  // Most recent first, as in Libby.
  return books.sort((a, b) => (b.returnedOn ?? b.firstSeen ?? "").localeCompare(a.returnedOn ?? a.firstSeen ?? "")).map((b, i) => ({ ...b, row: i }));
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");

/** Books come back from the browser between preview and import, so their shape is checked again. */
export function cleanLibbyBook(v: unknown): LibbyBook | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  const title = str(b.title, 500);
  if (!title) return null;
  const status = (["Currently Reading", "Read", "Abandoned", "To Read"] as const).find((s) => s === b.status) ?? "To Read";
  const coverUrl = str(b.coverUrl, 2000);
  return {
    row: typeof b.row === "number" ? b.row : 0,
    title,
    author: str(b.author, 500),
    publisher: str(b.publisher, 500),
    isbn13: toIsbn13(str(b.isbn13, 20)),
    coverUrl: /^https:\/\//.test(coverUrl) ? coverUrl : null,
    library: str(b.library, 200),
    status,
    firstSeen: isDay(b.firstSeen) ? b.firstSeen : null,
    returnedOn: isDay(b.returnedOn) ? b.returnedOn : null,
    match: null,
  };
}
