import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import path from "node:path";
import { createClient, type Client, type InStatement, type InValue, type ResultSet, type Transaction } from "@libsql/client";
import { slugify } from "./names";

/**
 * One database layer for everywhere. Locally it's the SQLite file in DATA_DIR; on Vercel it's a
 * Turso (libSQL) database set by TURSO_DATABASE_URL + TURSO_AUTH_TOKEN. Same SQL either way.
 * With accounts, each person has a library database of their own (see currentLibrary below).
 */

export const DATA_DIR = path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR ?? "data");
export const COVERS_DIR = path.join(DATA_DIR, "covers");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
  id                 INTEGER PRIMARY KEY,
  title              TEXT NOT NULL,
  author             TEXT NOT NULL DEFAULT '',
  author_sort        TEXT NOT NULL DEFAULT '',
  additional_authors TEXT NOT NULL DEFAULT '',
  isbn13             TEXT,
  rating             REAL, -- whole or half stars; older databases say INTEGER, which stores 3.5 as it is
  description        TEXT NOT NULL DEFAULT '',
  review             TEXT NOT NULL DEFAULT '',
  spoiler            TEXT NOT NULL DEFAULT '',
  quotes             TEXT NOT NULL DEFAULT '',
  private_notes      TEXT NOT NULL DEFAULT '',
  cover              TEXT,
  on_kindle          INTEGER NOT NULL DEFAULT 0,
  owned              INTEGER NOT NULL DEFAULT 0,
  publisher          TEXT NOT NULL DEFAULT '',
  publish_year       INTEGER,
  pages              INTEGER,
  ol_work            TEXT,
  ol_edition         TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS books_author_sort ON books(author_sort);

-- One row per time a book was read, so re-reads (even in the same year) each get their own row.
CREATE TABLE IF NOT EXISTS book_reads (
  id      INTEGER PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  year    INTEGER NOT NULL,
  note    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS book_reads_book ON book_reads(book_id);
CREATE INDEX IF NOT EXISTS book_reads_year ON book_reads(year);

-- Reading goal per year.
CREATE TABLE IF NOT EXISTS goals (
  year   INTEGER PRIMARY KEY,
  target INTEGER NOT NULL
);

-- Series ("Shades of Magic"), with each book's place in it.
CREATE TABLE IF NOT EXISTS series (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS book_series (
  book_id   INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  position  REAL
);

CREATE TABLE IF NOT EXISTS shelves (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL UNIQUE COLLATE NOCASE,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS book_shelves (
  book_id  INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  shelf_id INTEGER NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, shelf_id)
);

CREATE TABLE IF NOT EXISTS tags (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS book_tags (
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, tag_id)
);

CREATE TABLE IF NOT EXISTS people (
  id           INTEGER PRIMARY KEY,
  first        TEXT NOT NULL,
  last         TEXT NOT NULL DEFAULT '',
  relationship TEXT NOT NULL DEFAULT ''
);
-- kind 'for': the book was recommended to this person. kind 'by': this person recommended it.
CREATE TABLE IF NOT EXISTS recommendations (
  book_id   INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL CHECK (kind IN ('for', 'by')),
  PRIMARY KEY (book_id, person_id, kind)
);

-- Books marked "no cover" on the missing covers page.
CREATE TABLE IF NOT EXISTS cover_skipped (
  book_id INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE
);

-- Public, read-only pages of a person's books, reached by an unguessable token.
CREATE TABLE IF NOT EXISTS share_pages (
  person_id    INTEGER PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  enabled      INTEGER NOT NULL DEFAULT 1,
  list         TEXT NOT NULL DEFAULT 'for' CHECK (list IN ('for', 'by')),
  title        TEXT NOT NULL DEFAULT '',
  message      TEXT NOT NULL DEFAULT '',
  layout       TEXT NOT NULL DEFAULT 'grid' CHECK (layout IN ('grid', 'list')),
  show_ratings INTEGER NOT NULL DEFAULT 1,
  show_reviews INTEGER NOT NULL DEFAULT 0,
  accent       TEXT NOT NULL DEFAULT '#ececed'
);

-- Differences the bulk OpenLibrary refresh found, waiting for a yes or no.
CREATE TABLE IF NOT EXISTS refresh_suggestions (
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  field   TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (book_id, field)
);

-- Pairs marked "not duplicates" on the duplicates page. Stored with book_a < book_b.
CREATE TABLE IF NOT EXISTS not_duplicates (
  book_a INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  book_b INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  PRIMARY KEY (book_a, book_b)
);

-- How far through a book you are: set by hand, or synced from a linked Spotify audiobook.
CREATE TABLE IF NOT EXISTS book_progress (
  book_id     INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  percent     REAL NOT NULL CHECK (percent >= 0 AND percent <= 100),
  source      TEXT NOT NULL CHECK (source IN ('manual', 'spotify')),
  page        INTEGER,            -- manual progress by page, when the book has a page count
  position_ms INTEGER,            -- Spotify: listened so far
  duration_ms INTEGER,            -- Spotify: the whole audiobook
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The one Spotify account BookBox reads listening progress from.
CREATE TABLE IF NOT EXISTS spotify_account (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  display_name   TEXT NOT NULL DEFAULT '',
  country        TEXT,
  access_token   TEXT NOT NULL,
  refresh_token  TEXT NOT NULL,
  expires_at     INTEGER NOT NULL, -- ms since the epoch
  last_synced_at INTEGER
);

-- Which Spotify audiobook is which book, confirmed by you once.
CREATE TABLE IF NOT EXISTS spotify_links (
  book_id      INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  audiobook_id TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL DEFAULT ''
);

-- Where each unlinked Spotify audiobook stood when last checked, to notice when you start or resume one.
CREATE TABLE IF NOT EXISTS spotify_seen (
  audiobook_id TEXT PRIMARY KEY,
  position_ms  INTEGER NOT NULL,
  checked_at   INTEGER NOT NULL
);

-- Your preferences, edited on the Settings page (see src/lib/settings.ts for the keys).
-- Your own copies lent to people. Open while returned_on is null; returned loans are kept as history.
CREATE TABLE IF NOT EXISTS loans (
  id          INTEGER PRIMARY KEY,
  book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  person_id   INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  lent_on     TEXT NOT NULL,
  returned_on TEXT
);
CREATE INDEX IF NOT EXISTS loans_book ON loans(book_id);
CREATE INDEX IF NOT EXISTS loans_person ON loans(person_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Keys other apps use to read your stats through /api/v1 (see src/lib/api-keys.ts). Only a hash of each key is kept.
CREATE TABLE IF NOT EXISTS api_keys (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  hash         TEXT NOT NULL UNIQUE,  -- SHA-256 of the whole key
  prefix       TEXT NOT NULL,         -- the start of the key, to tell them apart in Settings
  origins      TEXT NOT NULL DEFAULT '', -- websites allowed to use it from the browser, space-separated
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

-- Failed sign-ins per network address (hashed, never stored as-is), to slow down password guessing.
CREATE TABLE IF NOT EXISTS login_failures (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  first_at INTEGER NOT NULL
);

-- An audiobook whose book is being found or created right now, so two requests at once can't both create it.
CREATE TABLE IF NOT EXISTS spotify_adding (
  audiobook_id TEXT PRIMARY KEY,
  started_at   INTEGER NOT NULL
);

-- Spotify audiobooks to leave alone: never suggested, linked or added automatically.
CREATE TABLE IF NOT EXISTS spotify_ignored (
  audiobook_id TEXT PRIMARY KEY
);

-- Each author's gender, for the Stats breakdown (see src/lib/author-genders.ts): looked up on
-- Wikidata, or set by you, which a lookup never overwrites. A null gender is not known: Wikidata had
-- nothing certain, or you said so.
CREATE TABLE IF NOT EXISTS author_genders (
  name        TEXT PRIMARY KEY COLLATE NOCASE, -- as written on books (books.author)
  gender      TEXT CHECK (gender IN ('woman', 'man', 'nonbinary')),
  source      TEXT NOT NULL CHECK (source IN ('wikidata', 'you')),
  wikidata_id TEXT,
  checked_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The Libby account BookBox reads loans and holds from: a device identity linked to your library
-- cards with Libby's "Copy To Another Device" code (see src/lib/libby-sync.ts).
CREATE TABLE IF NOT EXISTS libby_account (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  token          TEXT NOT NULL,
  libraries      TEXT NOT NULL DEFAULT '', -- your cards' library names, for Settings
  time_zone      TEXT,                     -- the device's, for the days books are borrowed and due
  attempted_at   INTEGER,                  -- ms since the epoch: the last sync, whether or not it worked
  running_since  INTEGER,                  -- set while a sync runs, so two can't run at once
  last_synced_at INTEGER,                  -- the last sync that worked
  error          TEXT                      -- why the last sync failed, until one works
);

-- Each title on your Libby shelf at the last sync, and the book it is. A null book_id is a book you
-- deleted, left alone from then on.
CREATE TABLE IF NOT EXISTS libby_titles (
  title_id TEXT PRIMARY KEY,
  book_id  INTEGER,
  state    TEXT NOT NULL CHECK (state IN ('loan', 'hold', 'gone'))
);
CREATE INDEX IF NOT EXISTS libby_titles_book ON libby_titles(book_id);
`;

// Columns added after the first release. Added in place so existing databases keep their data.
const ADDED_COLUMNS: [table: string, column: string, definition: string][] = [
  ["books", "borrowed", "INTEGER NOT NULL DEFAULT 0"],
  ["books", "library", "TEXT NOT NULL DEFAULT ''"],
  ["books", "due_date", "TEXT"],
  ["books", "bad_isbn", "TEXT"], // what Airtable had when it wasn't a valid ISBN
  ["books", "isbn_skipped", "INTEGER NOT NULL DEFAULT 0"],
  ["books", "ol_checked_at", "TEXT"], // last bulk OpenLibrary refresh
  ["books", "author_original", "TEXT NOT NULL DEFAULT ''"], // the author's name in its original script (村上春樹)
  ["people", "slug", "TEXT"], // "colette-shade", for /people/colette-shade
  // The series on Hardcover, once looked up: its id, or null with hardcover_checked_at set when Hardcover doesn't have it.
  ["series", "hardcover_id", "INTEGER"],
  ["series", "hardcover_checked_at", "TEXT"],
  // Share pages list the books for someone, then (when on) the books they recommended to you.
  // The older `list` column picked one or the other; it's now always 'for'.
  ["share_pages", "show_theirs", "INTEGER NOT NULL DEFAULT 1"],
  // Set when a read is added through the offline outbox, so a retried sync never adds it twice.
  ["book_reads", "client_id", "TEXT"],
  // Set once every audiobook already in the Spotify library has a recorded position, so only
  // listening after that point pulls a book into Currently Reading.
  ["spotify_account", "baselined", "INTEGER NOT NULL DEFAULT 0"],
  // Days as YYYY-MM-DD, on the device's calendar. A read's dates are optional (older reads only
  // have a year); books.started_on is when the read in progress began.
  ["books", "started_on", "TEXT"],
  ["book_reads", "started_on", "TEXT"],
  ["book_reads", "finished_on", "TEXT"],
];

async function migrate(c: Client) {
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const cols = (await c.execute(`PRAGMA table_info(${table})`)).rows as unknown as { name: string }[];
    if (!cols.some((col) => col.name === column)) await c.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  // book_years (one row per book and year) became book_reads (one row per read).
  const old = await c.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'book_years'");
  if (old.rows.length) {
    await c.batch(["INSERT INTO book_reads (book_id, year) SELECT book_id, year FROM book_years ORDER BY book_id, year", "DROP TABLE book_years"], "write");
  }
  // People got URL slugs; give everyone without one a unique slug, oldest first.
  const unslugged = (await c.execute("SELECT id, first, last FROM people WHERE slug IS NULL OR slug = '' ORDER BY id")).rows;
  if (unslugged.length) {
    const taken = new Set((await c.execute("SELECT slug FROM people WHERE slug IS NOT NULL AND slug != ''")).rows.map((r) => String(r.slug)));
    const updates = unslugged.map((r) => {
      const base = slugify(String(r.first), String(r.last));
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
      taken.add(slug);
      return { sql: "UPDATE people SET slug = ? WHERE id = ?", args: [slug, r.id] };
    });
    await c.batch(updates, "write");
  }
  await c.execute("CREATE UNIQUE INDEX IF NOT EXISTS people_slug ON people(slug)");
  await c.execute("CREATE UNIQUE INDEX IF NOT EXISTS book_reads_client ON book_reads(client_id)");
}

/** Where the main library lives: Turso when TURSO_DATABASE_URL is set, otherwise a file in DATA_DIR. */
export function libraryConnection() {
  if (process.env.BOOKBOX_DEMO === "1") throw new Error("The demo has no main library: every visitor's is a throwaway (see demo.ts).");
  return { url: process.env.TURSO_DATABASE_URL ?? `file:${path.join(DATA_DIR, "bookbox.db")}`, authToken: process.env.TURSO_AUTH_TOKEN };
}

/**
 * A library database: the main one (accountId null for the copy's owner, or no accounts at all) or
 * a person's own. Every query runs against exactly one.
 */
export type Library = { accountId: number | null; url: string; authToken?: string; demoId?: string };

export const mainLibrary = (): Library => ({ accountId: null, ...libraryConnection() });

// Work that isn't a signed-in request (share pages, API keys, background jobs) names its library.
const libraryScope = new AsyncLocalStorage<Library>();

/** Runs fn with every query inside it (however deep) going to this library. */
export function withLibrary<T>(library: Library, fn: () => Promise<T>): Promise<T> {
  return libraryScope.run(library, fn);
}

export class SignedOutError extends Error {
  constructor() {
    super("No signed-in account for this request, so there's no library to read.");
  }
}

// Each account's library, per server instance for a short while, so a query needn't look it up.
const LOOKUP_MS = 30_000;
const g = globalThis as unknown as {
  bookboxLibraries?: Map<number, { at: number; library: Library | null }>;
  bookboxClients?: Map<string, { client: Client; ready?: Promise<void>; schema?: string }>;
};
const libraries = (g.bookboxLibraries ??= new Map());

/**
 * The library this code is running for:
 * - inside withLibrary, that one;
 * - without accounts (a copy on your own computer with no password), the main one;
 * - in a signed-in request, the account's;
 * - in the scripts (no Next.js server), the main one.
 * Anything else in the server is a mistake (it would otherwise read someone else's library), so it throws.
 */
export async function currentLibrary(): Promise<Library> {
  const scoped = libraryScope.getStore();
  if (scoped) return scoped;
  if (process.env.BOOKBOX_DEMO === "1") return currentDemoLibrary();
  const { authEnabled, readSession, SESSION_COOKIE } = await import("./auth");
  if (!authEnabled() || !process.env.NEXT_RUNTIME) return mainLibrary();
  let token: string | undefined;
  try {
    const { cookies } = await import("next/headers");
    token = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    throw new Error("A query ran outside a request without withLibrary(), so BookBox can't tell whose library it's for.");
  }
  const session = await readSession(token);
  // Also checked here, not only in the proxy: server actions can be posted to pages the proxy lets
  // through (the front page, /s/…), and a cookie from before a password change must not work there.
  if (!session || !(await (await import("./session")).sessionIsCurrent(token))) throw new SignedOutError();
  const library = await libraryFor(session.accountId);
  if (!library) throw new SignedOutError();
  return library;
}

/** The demo visitor's throwaway library, named by the cookie the proxy gave them. */
async function currentDemoLibrary(): Promise<Library> {
  const { checkDemoEnvironment, DEMO_COOKIE, isDemoId } = await import("./demo");
  checkDemoEnvironment();
  const { cookies } = await import("next/headers");
  const id = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!isDemoId(id)) throw new SignedOutError();
  const { demoLibrary } = await import("./demo-library");
  return demoLibrary(id);
}

/** An account's library, or null when the account is gone. */
export async function libraryFor(accountId: number): Promise<Library | null> {
  const hit = libraries.get(accountId);
  if (hit && Date.now() - hit.at < LOOKUP_MS) return hit.library;
  const { getAccount } = await import("./accounts");
  const account = await getAccount(accountId);
  const library: Library | null = account
    ? account.dbUrl
      ? { accountId: account.id, url: account.dbUrl, authToken: account.dbToken ?? undefined }
      : { ...mainLibrary(), accountId: account.id }
    : null;
  libraries.set(accountId, { at: Date.now(), library });
  return library;
}

// Reuse one client (and one schema check) per database across hot reloads in dev and warm serverless invocations.
const clients = (g.bookboxClients ??= new Map());

// Changes whenever the schema or migrations do, so a running dev server re-checks after an edit.
const SCHEMA_VERSION = createHash("sha1").update(SCHEMA).update(JSON.stringify(ADDED_COLUMNS)).update(migrate.toString()).digest("hex").slice(0, 16);

/** The library's client, with its schema brought up to date (a new person's library is set up on its first query). */
async function clientFor(library: Library): Promise<Client> {
  let entry = clients.get(library.url);
  if (!entry) {
    entry = { client: createClient({ url: library.url, authToken: library.authToken }) };
    clients.set(library.url, entry);
  }
  if (entry.schema !== SCHEMA_VERSION) {
    entry.schema = SCHEMA_VERSION;
    entry.ready = undefined;
  }
  const { client } = entry;
  entry.ready ??= (async () => {
    // A cold start only needs one query when the database is already on this schema; the full
    // schema and migration pass (dozens of round trips to a hosted database) runs after a change.
    const stamped = await client.execute("SELECT value FROM bookbox_meta WHERE key = 'schema'").then(
      (r: ResultSet) => r.rows[0]?.value,
      () => undefined, // no such table yet
    );
    if (stamped === SCHEMA_VERSION) return;
    if (library.url.startsWith("file:")) await client.execute("PRAGMA journal_mode = WAL");
    await client.executeMultiple(SCHEMA);
    await migrate(client);
    // A new demo library starts as a copy of the snapshot.
    if (library.demoId && stamped === undefined) await (await import("./demo-library")).seedDemo(client);
    await client.batch(
      [
        "CREATE TABLE IF NOT EXISTS bookbox_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        { sql: "INSERT INTO bookbox_meta (key, value) VALUES ('schema', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [SCHEMA_VERSION] },
      ],
      "write",
    );
  })().catch((err) => {
    entry.ready = undefined; // retry on the next query
    throw err;
  });
  await entry.ready;
  return client;
}

/** Closes a library's client, before its database is deleted. */
export function closeLibrary(library: Library) {
  clients.get(library.url)?.client.close();
  clients.delete(library.url);
}

/** Sets up a new library's tables now, rather than on its first query. */
export async function prepareLibrary(library: Library) {
  await clientFor(library);
}

export type Param = InValue;
export type Row = Record<string, unknown>;

// Queries inside transaction(...) run on that transaction without having to pass it around.
const currentTx = new AsyncLocalStorage<Transaction>();

async function execute(stmt: InStatement) {
  const tx = currentTx.getStore();
  return tx ? tx.execute(stmt) : (await clientFor(await currentLibrary())).execute(stmt);
}

// Rows are copied into plain objects: React won't pass libSQL's row objects to client components.
const plain = (rows: unknown[]) => rows.map((r) => ({ ...(r as Row) }));

export const db = {
  prepare(sql: string) {
    return {
      get: async (...args: Param[]): Promise<Row | undefined> => plain((await execute({ sql, args })).rows)[0],
      all: async (...args: Param[]): Promise<Row[]> => plain((await execute({ sql, args })).rows),
      run: async (...args: Param[]) => {
        const r = await execute({ sql, args });
        return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid };
      },
    };
  },
  /** Several statements separated by semicolons, without parameters. */
  async exec(sql: string) {
    const tx = currentTx.getStore();
    if (tx) await tx.executeMultiple(sql);
    else await (await clientFor(await currentLibrary())).executeMultiple(sql);
  },
};

/** Runs fn in a write transaction; any db call inside it (however deep) joins the transaction. */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  if (currentTx.getStore()) return fn(); // already inside one
  const tx = await (await clientFor(await currentLibrary())).transaction("write");
  try {
    const result = await currentTx.run(tx, fn);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  } finally {
    tx.close();
  }
}

/** Runs many statements in one round trip, atomically. For bulk copies; app code uses transaction(). */
export async function batch(stmts: InStatement[]) {
  return (await clientFor(await currentLibrary())).batch(stmts, "write");
}

// Foreign keys aren't enforced over libsql/Turso connections, so child rows are deleted explicitly.
const BOOK_CHILDREN = [
  "book_reads",
  "book_series",
  "book_shelves",
  "book_tags",
  "recommendations",
  "cover_skipped",
  "refresh_suggestions",
  "book_progress",
  "spotify_links",
  "loans",
];

export async function deleteBookRows(id: number) {
  await transaction(async () => {
    for (const table of BOOK_CHILDREN) await db.prepare(`DELETE FROM ${table} WHERE book_id = ?`).run(id);
    await db.prepare("DELETE FROM not_duplicates WHERE book_a = ? OR book_b = ?").run(id, id);
    // Kept, without its book, so the Libby sync doesn't add the book back.
    await db.prepare("UPDATE libby_titles SET book_id = NULL WHERE book_id = ?").run(id);
    await db.prepare("DELETE FROM books WHERE id = ?").run(id);
  });
}
