import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { createClient, type Client, type InStatement, type InValue, type Transaction } from "@libsql/client";

/**
 * One database layer for everywhere. Locally it's the SQLite file in DATA_DIR; on Vercel it's a
 * Turso (libSQL) database set by TURSO_DATABASE_URL + TURSO_AUTH_TOKEN. Same SQL either way.
 */

export const DATA_DIR = path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR ?? "data");
export const COVERS_DIR = path.join(DATA_DIR, "covers");
export const IS_REMOTE_DB = !!process.env.TURSO_DATABASE_URL;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
  id                 INTEGER PRIMARY KEY,
  title              TEXT NOT NULL,
  author             TEXT NOT NULL DEFAULT '',
  author_sort        TEXT NOT NULL DEFAULT '',
  additional_authors TEXT NOT NULL DEFAULT '',
  isbn13             TEXT,
  rating             INTEGER,
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
}

function open(): Client {
  const url = process.env.TURSO_DATABASE_URL ?? `file:${path.join(DATA_DIR, "bookbox.db")}`;
  return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}

// Reuse one client (and one schema check) across hot reloads in dev and warm serverless invocations.
const g = globalThis as unknown as { bookboxClient?: Client; bookboxReady?: Promise<void> };
const client = (g.bookboxClient ??= open());

function ready(): Promise<void> {
  g.bookboxReady ??= (async () => {
    if (!IS_REMOTE_DB) await client.execute("PRAGMA journal_mode = WAL");
    await client.executeMultiple(SCHEMA);
    await migrate(client);
  })().catch((err) => {
    g.bookboxReady = undefined; // retry on the next query
    throw err;
  });
  return g.bookboxReady;
}

export type Param = InValue;
export type Row = Record<string, unknown>;

// Queries inside transaction(...) run on that transaction without having to pass it around.
const currentTx = new AsyncLocalStorage<Transaction>();

async function execute(stmt: InStatement) {
  await ready();
  const tx = currentTx.getStore();
  return tx ? tx.execute(stmt) : client.execute(stmt);
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
    await ready();
    const tx = currentTx.getStore();
    if (tx) await tx.executeMultiple(sql);
    else await client.executeMultiple(sql);
  },
};

/** Runs fn in a write transaction; any db call inside it (however deep) joins the transaction. */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  if (currentTx.getStore()) return fn(); // already inside one
  await ready();
  const tx = await client.transaction("write");
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
  await ready();
  return client.batch(stmts, "write");
}

// Foreign keys aren't enforced over libsql/Turso connections, so child rows are deleted explicitly.
const BOOK_CHILDREN = ["book_reads", "book_series", "book_shelves", "book_tags", "recommendations", "cover_skipped", "refresh_suggestions"];

export async function deleteBookRows(id: number) {
  await transaction(async () => {
    for (const table of BOOK_CHILDREN) await db.prepare(`DELETE FROM ${table} WHERE book_id = ?`).run(id);
    await db.prepare("DELETE FROM not_duplicates WHERE book_a = ? OR book_b = ?").run(id, id);
    await db.prepare("DELETE FROM books WHERE id = ?").run(id);
  });
}
