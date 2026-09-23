import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

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

CREATE TABLE IF NOT EXISTS book_years (
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  year    INTEGER NOT NULL,
  PRIMARY KEY (book_id, year)
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

-- Pairs marked "not duplicates" on the duplicates page. Stored with book_a < book_b.
CREATE TABLE IF NOT EXISTS not_duplicates (
  book_a INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  book_b INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  PRIMARY KEY (book_a, book_b)
);
`;

function open(): DatabaseSync {
  fs.mkdirSync(COVERS_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "bookbox.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
}

type Param = string | number | bigint | null | Uint8Array;
type Row = Record<string, unknown>;

// node:sqlite returns null-prototype rows, which React refuses to pass to client
// components. Copy them into plain objects here so the rest of the app doesn't care.
function wrap(raw: DatabaseSync) {
  return {
    exec: (sql: string) => raw.exec(sql),
    prepare(sql: string) {
      const st = raw.prepare(sql);
      return {
        run: (...params: Param[]) => st.run(...params),
        get: (...params: Param[]): Row | undefined => {
          const row = st.get(...params);
          return row ? { ...row } : undefined;
        },
        all: (...params: Param[]): Row[] => st.all(...params).map((row) => ({ ...row })),
      };
    },
  };
}

// Reuse one connection across hot reloads in dev.
const globalForDb = globalThis as unknown as { bookboxDb?: ReturnType<typeof wrap> };
export const db = globalForDb.bookboxDb ?? wrap(open());
globalForDb.bookboxDb = db;

export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
