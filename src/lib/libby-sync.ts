import "server-only";
import { finishReading, saveBook, setStatus } from "./books";
import { db, transaction } from "./db";
import { findMatches } from "./goodreads";
import { fetchLibbyCovers } from "./libby-import";
import { toIsbn13 } from "./names";

/**
 * Loans and holds from Libby, kept up to date. Libby has no public API, so this uses the private
 * one the Libby app itself talks to (as odmpy and the Libby plugin for Calibre do): BookBox makes
 * itself a device identity, links it to your library cards with the 8-digit code from Libby's
 * Settings → Copy To Another Device, and from then on reads your shelf. It can stop working
 * whenever Libby changes; BookBox only reads, but the identity could borrow and return on your
 * cards, so it stays on the server.
 *
 * Each sync compares your shelf with the last one:
 * - A new loan: the book (found in your library, or added) is marked borrowed, with its library and
 *   due date, and moves to Currently Reading from the day you borrowed it.
 * - A loan that's gone: the book is no longer borrowed and, if it's still Currently Reading, moves
 *   to Read that day. Libby doesn't say whether you finished, the same as the timeline import.
 * - A new hold: a book you don't have yet is added to To Read.
 * The first sync takes your shelf as it is, but leaves books you've already marked Read or Not
 * finished where they are. Magazines are skipped.
 */

const API = "https://sentry-read.svc.overdrive.com";
// The headers the Libby web app sends, as the open-source clients above do; Libby has no API for other apps.
const HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 11_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.2 Safari/605.1.15",
  Referer: "https://libbyapp.com/",
  "Cache-Control": "no-cache",
};
/** Don't ask Libby more often than this when the app is opened repeatedly. */
const SYNC_EVERY_MS = 10 * 60 * 1000;
/** A sync that started longer ago than this died without finishing; it no longer blocks the next. */
const RUNNING_EXPIRES_MS = 5 * 60 * 1000;

export class LibbyError extends Error {
  constructor(
    message: string,
    /** Libby no longer accepts the identity, so it needs a new code. */
    public signedOut = false,
  ) {
    super(message);
  }
}

type Cover = { href?: string; width?: number };
type Title = {
  id: string;
  title?: string;
  firstCreatorName?: string;
  publisherAccount?: { name?: string };
  type?: { id?: string };
  covers?: Record<string, Cover>;
  formats?: { identifiers?: { type?: string; value?: string }[] }[];
  detailedSeries?: { seriesName?: string; readingOrder?: string };
  cardId?: string;
};
type Loan = Title & { checkoutDate?: string; expireDate?: string };
type Hold = Title & { placedDate?: string };
type Card = { cardId: string; advantageKey?: string; cardName?: string; library?: { name?: string } };
type Shelf = { result?: string; cards?: Card[]; loans?: Loan[]; holds?: Hold[] };

async function call<T>(path: string, init: { method?: string; token?: string; form?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? (init.form ? "POST" : "GET"),
    headers: {
      ...HEADERS,
      ...(init.token && { Authorization: `Bearer ${init.token}` }),
      ...(init.form && { "Content-Type": "application/x-www-form-urlencoded" }),
    },
    body: init.form ? new URLSearchParams(init.form) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res) throw new LibbyError("Couldn’t reach Libby. Try again in a minute.");
  const body = (await res.json().catch(() => null)) as (T & { result?: string; upstream?: { userExplanation?: string } }) | null;
  if (res.status === 401 || res.status === 403) throw new LibbyError("Libby signed BookBox out. Connect again with a new code.", true);
  if (!res.ok) throw new LibbyError(body?.upstream?.userExplanation || `Libby answered ${res.status}.`);
  return body ?? ({} as T);
}

async function fetchShelf(token: string): Promise<Shelf & { cards: Card[]; loans: Loan[]; holds: Hold[] }> {
  const shelf = await call<Shelf>("/chip/sync", { token });
  // Anything short of a full shelf would look like every loan was returned.
  if (shelf.result !== "synchronized" || !Array.isArray(shelf.loans)) throw new LibbyError("Libby sent back an incomplete shelf.");
  if (!shelf.cards?.length) throw new LibbyError("Libby says there are no library cards on this account. Connect again with a new code.", true);
  return { ...shelf, cards: shelf.cards, loans: shelf.loans, holds: Array.isArray(shelf.holds) ? shelf.holds : [] };
}

const libraryNames = (cards: Card[]) => [...new Set(cards.map((c) => c.library?.name || c.advantageKey || "").filter(Boolean))].join(", ");

/** A time zone name the server knows, or null. */
export function cleanTimeZone(v: unknown): string | null {
  if (typeof v !== "string" || !v || v.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return v;
  } catch {
    return null;
  }
}

/** The day (YYYY-MM-DD) a moment falls on in the device's time zone. */
function dayIn(t: string | number, timeZone: string | null): string | null {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Links BookBox to your Libby cards with the code from Libby's Settings → Copy To Another Device,
 * then runs the first sync.
 */
export async function connectLibby(code: string, timeZone: string | null) {
  if (!/^\d{8}$/.test(code)) throw new LibbyError("The code is the 8 digits Libby shows under Copy To Another Device.");
  const { identity } = await call<{ identity?: string }>("/chip?client=dewey", { method: "POST" });
  if (!identity) throw new LibbyError("Libby didn’t start the connection. Try again in a minute.");
  try {
    await call("/chip/clone/code", { token: identity, form: { code } });
  } catch (err) {
    // A wrong or expired code comes back as a refusal, not a sign-out.
    throw new LibbyError(err instanceof LibbyError && !err.signedOut ? `Libby didn’t accept that code: ${err.message}` : "Libby didn’t accept that code. Codes only last a minute or so: get a new one and try again.");
  }
  const shelf = await fetchShelf(identity);
  await transaction(async () => {
    await db.exec("DELETE FROM libby_account; DELETE FROM libby_titles");
    await db.prepare("INSERT INTO libby_account (id, token, libraries, time_zone) VALUES (1, ?, ?, ?)").run(identity, libraryNames(shelf.cards), timeZone);
  });
  // Connected either way: a first sync that fails is saved on the account and shown in Settings.
  await syncLibby({ force: true }).catch(() => {});
}

export async function disconnectLibby() {
  await db.exec("DELETE FROM libby_account; DELETE FROM libby_titles");
}

type Account = {
  token: string;
  libraries: string;
  time_zone: string | null;
  attempted_at: number | null;
  running_since: number | null;
  last_synced_at: number | null;
  error: string | null;
};

export async function getLibbyAccount() {
  return (await db.prepare("SELECT token, libraries, time_zone, attempted_at, running_since, last_synced_at, error FROM libby_account WHERE id = 1").get()) as
    | Account
    | undefined;
}

/** What Settings shows: never the token. */
export async function libbyStatus() {
  const a = await getLibbyAccount();
  if (!a) return null;
  const counts = (await db.prepare("SELECT state, count(*) AS n FROM libby_titles WHERE state != 'gone' GROUP BY state").all()) as { state: string; n: number }[];
  return {
    libraries: a.libraries,
    lastSyncedAt: a.last_synced_at,
    error: a.error,
    loans: counts.find((c) => c.state === "loan")?.n ?? 0,
    holds: counts.find((c) => c.state === "hold")?.n ?? 0,
  };
}

const isbnOf = (t: Title) => {
  for (const f of t.formats ?? []) for (const id of f.identifiers ?? []) if (/isbn/i.test(id.type ?? "") && toIsbn13(id.value)) return toIsbn13(id.value);
  return null;
};
const coverOf = (t: Title) => {
  const best = Object.values(t.covers ?? {}).sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.href;
  return best ? best.replace(/^http:\/\//, "https://") : null;
};

/**
 * Syncs your Libby shelf into BookBox. Skipped when it ran in the last few minutes, unless
 * `force`, or when another sync is running. `timeZone` (the device's, when it sends one) is kept
 * for syncs that don't. Returns the books that changed.
 */
export async function syncLibby({ force = false, timeZone = null }: { force?: boolean; timeZone?: string | null } = {}): Promise<{ synced: boolean; changed: number[] }> {
  const now = Date.now();
  // Claiming the run is one update, so only one of two requests at once goes ahead.
  const claim = await db
    .prepare(
      `UPDATE libby_account SET running_since = ?, attempted_at = ?, time_zone = coalesce(?, time_zone)
       WHERE id = 1 AND (running_since IS NULL OR running_since < ?) AND (? OR attempted_at IS NULL OR attempted_at < ?)`,
    )
    .run(now, now, timeZone, now - RUNNING_EXPIRES_MS, force ? 1 : 0, now - SYNC_EVERY_MS);
  if (!claim.changes) return { synced: false, changed: [] };
  const account = (await getLibbyAccount())!;
  try {
    const changed = await applyShelf(await fetchShelf(account.token), account);
    await db.prepare("UPDATE libby_account SET last_synced_at = ?, error = NULL WHERE id = 1").run(Date.now());
    return { synced: true, changed };
  } catch (err) {
    await db.prepare("UPDATE libby_account SET error = ? WHERE id = 1").run(err instanceof LibbyError ? err.message : "The last sync didn’t finish.");
    throw err;
  } finally {
    await db.prepare("UPDATE libby_account SET running_since = NULL WHERE id = 1").run();
  }
}

async function applyShelf(shelf: Awaited<ReturnType<typeof fetchShelf>>, account: Account): Promise<number[]> {
  const tz = account.time_zone;
  const today = dayIn(Date.now(), tz)!;
  const firstSync = account.last_synced_at === null;
  const changed = new Set<number>();
  const library = (t: Title) => {
    const card = shelf.cards.find((c) => c.cardId === t.cardId);
    return card?.library?.name || card?.advantageKey || "";
  };

  const books = (t: Title) => t.type?.id !== "magazine" && !!t.id && !!t.title;
  const loans = shelf.loans.filter(books);
  const loanIds = new Set(loans.map((l) => String(l.id)));
  const holds = shelf.holds.filter((h) => books(h) && !loanIds.has(String(h.id)));
  await db.prepare("UPDATE libby_account SET libraries = ? WHERE id = 1").run(libraryNames(shelf.cards));

  const known = new Map(
    ((await db.prepare("SELECT title_id, book_id, state FROM libby_titles").all()) as { title_id: string; book_id: number | null; state: string }[]).map((r) => [r.title_id, r]),
  );
  // Books already in your library, by ISBN or title and author, for titles BookBox hasn't seen.
  const unseen = [...loans, ...holds].filter((t) => !known.has(String(t.id)));
  const matches = new Map(
    (await findMatches(unseen.map((t) => ({ id: String(t.id), title: t.title!, author: t.firstCreatorName ?? "", isbn13: isbnOf(t), match: null as { id: number; title: string } | null })))).map((m) => [
      m.id,
      m.match?.id ?? null,
    ]),
  );
  const status = async (bookId: number) =>
    ((await db
      .prepare("SELECT s.name FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id WHERE bs.book_id = ? AND s.name IN ('To Read', 'Currently Reading', 'Read', 'Abandoned')")
      .get(bookId)) as { name: string } | undefined)?.name ?? null;
  const remember = (titleId: string, bookId: number | null, state: "loan" | "hold" | "gone") =>
    db
      .prepare("INSERT INTO libby_titles (title_id, book_id, state) VALUES (?, ?, ?) ON CONFLICT(title_id) DO UPDATE SET book_id = excluded.book_id, state = excluded.state")
      .run(titleId, bookId, state);
  const newCovers: { id: number; isbn13: string | null; coverUrl: string | null }[] = [];

  // 1. Loans.
  for (const loan of loans) {
    const titleId = String(loan.id);
    const row = known.get(titleId);
    if (row && row.book_id === null) continue; // a book you deleted
    const due = loan.expireDate ? dayIn(loan.expireDate, tz) : null;
    const borrowedOn = (loan.checkoutDate && dayIn(loan.checkoutDate, tz)) || today;
    let bookId = row?.book_id ?? matches.get(titleId) ?? null;
    if (bookId === null) {
      bookId = await addBook(loan, { borrowed: true, library: library(loan), due, shelf: "Currently Reading" });
      newCovers.push({ id: bookId, isbn13: isbnOf(loan), coverUrl: coverOf(loan) });
      await setStatus(bookId, "Currently Reading", borrowedOn);
      await remember(titleId, bookId, "loan");
      changed.add(bookId);
      continue;
    }
    // Due dates move when you renew, so they're refreshed every time.
    const before = (await db.prepare("SELECT borrowed, library, due_date FROM books WHERE id = ?").get(bookId)) as
      | { borrowed: number; library: string; due_date: string | null }
      | undefined;
    if (!before) continue;
    if (before.borrowed !== 1 || before.library !== library(loan) || before.due_date !== due) {
      await db.prepare("UPDATE books SET borrowed = 1, library = ?, due_date = ?, updated_at = datetime('now') WHERE id = ?").run(library(loan), due, bookId);
      changed.add(bookId);
    }
    if (row?.state !== "loan") {
      // Newly borrowed (or, on the first sync, borrowed now): you're reading it, unless on the
      // first sync you've already said you finished it or gave up.
      const current = await status(bookId);
      const settled = firstSync && (current === "Read" || current === "Abandoned");
      if (current !== "Currently Reading" && !settled) {
        await setStatus(bookId, "Currently Reading", borrowedOn);
        changed.add(bookId);
      }
    }
    await remember(titleId, bookId, "loan");
  }

  // 2. Holds: books you don't have yet go on To Read. Books you have are left where they are.
  for (const hold of holds) {
    const titleId = String(hold.id);
    const row = known.get(titleId);
    if (row?.state === "loan") continue; // returned and put on hold again: handled as a return below
    if (row) {
      if (row.state !== "hold") await remember(titleId, row.book_id, "hold");
      continue;
    }
    let bookId = matches.get(titleId) ?? null;
    if (bookId === null) {
      bookId = await addBook(hold, { borrowed: false, library: "", due: null, shelf: "To Read" });
      newCovers.push({ id: bookId, isbn13: isbnOf(hold), coverUrl: coverOf(hold) });
      changed.add(bookId);
    }
    await remember(titleId, bookId, "hold");
  }

  // 3. Loans that are gone: returned (by you, or when they were due).
  const holdIds = new Set(holds.map((h) => String(h.id)));
  for (const row of known.values()) {
    if (loanIds.has(row.title_id)) continue;
    if (row.state === "loan" && row.book_id !== null) {
      const bookId = row.book_id;
      await db.prepare("UPDATE books SET borrowed = 0, library = '', due_date = NULL, updated_at = datetime('now') WHERE id = ?").run(bookId);
      if ((await status(bookId)) === "Currently Reading") await finishReading(bookId, today, `libby-${row.title_id}-${today}`);
      changed.add(bookId);
    }
    const state = holdIds.has(row.title_id) ? "hold" : "gone";
    if (row.state !== state) await remember(row.title_id, row.book_id, state);
  }

  // Covers last, so a slow image never holds up the shelf.
  if (newCovers.length) await fetchLibbyCovers(newCovers).catch(() => 0);
  return [...changed];
}

async function addBook(t: Title, o: { borrowed: boolean; library: string; due: string | null; shelf: string }): Promise<number> {
  const position = Number(t.detailedSeries?.readingOrder);
  return saveBook(null, {
    title: t.title!.slice(0, 500),
    author: t.firstCreatorName ?? "",
    author_original: "",
    additional_authors: "",
    isbn13: isbnOf(t),
    rating: null,
    description: "",
    review: "",
    spoiler: "",
    quotes: "",
    private_notes: "",
    on_kindle: false,
    owned: false,
    publisher: t.publisherAccount?.name ?? "",
    publish_year: null,
    pages: null,
    ol_work: null,
    ol_edition: null,
    borrowed: o.borrowed,
    library: o.library,
    due_date: o.due,
    series_name: t.detailedSeries?.seriesName ?? "",
    series_position: Number.isFinite(position) && position > 0 ? position : null,
    years: [],
    shelves: [o.shelf],
    tags: [],
    recommendedFor: [],
    recommendedBy: [],
  });
}
