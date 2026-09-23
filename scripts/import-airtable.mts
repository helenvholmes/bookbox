/**
 * One-time import of the Airtable "Books" base.
 *
 *   npm run import:airtable            # refuses if the database already has books
 *   npm run import:airtable -- --fresh # deletes the database and covers first
 *
 * Inputs (in DATA_DIR, default ./data):
 *   airtable-books.csv    "All Books" view export
 *   airtable-people.json  People table (first/last/relationship + linked Book Ids)
 *   airtable-covers/      covers downloaded from the export, named <Book Id>.<ext>
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "data");
const fresh = process.argv.includes("--fresh");
if (fresh) {
  for (const f of ["bookbox.db", "bookbox.db-wal", "bookbox.db-shm"]) fs.rmSync(path.join(DATA_DIR, f), { force: true });
  fs.rmSync(path.join(DATA_DIR, "covers"), { recursive: true, force: true });
}

// Imported after the cleanup so the database is created fresh.
const { db, transaction } = await import("../src/lib/db");
const { saveCover } = await import("../src/lib/covers");
const { authorSort, toIsbn13 } = await import("../src/lib/names");

const existing = db.prepare("SELECT count(*) AS n FROM books").get() as { n: number };
if (existing.n > 0) {
  console.error(`Database already has ${existing.n} books. Re-run with --fresh to replace it.`);
  process.exit(1);
}

type Row = Record<string, string>;
const rows: Row[] = parse(fs.readFileSync(path.join(DATA_DIR, "airtable-books.csv")), {
  columns: true,
  bom: true,
  skip_empty_lines: true,
});
type Person = { first: string; last: string; rel: string; for: string; by: string };
const people: Person[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "airtable-people.json"), "utf8"));

const list = (s: string | undefined) => (s ?? "").split(",").map((v) => v.trim()).filter(Boolean);
const checked = (s: string | undefined) => (s === "checked" ? 1 : 0);

const SHELF_ORDER = ["Currently Reading", "To Read", "Read", "Abandoned", "College Textbooks"];
const EXTRA_TAGS = ["Anglophile", "Latinoamerican Studies", "Poetry", "Russia Studies"]; // exist in Airtable with no books

const warnings: string[] = [];

const insertBook = db.prepare(`
  INSERT INTO books (id, title, author, author_sort, additional_authors, isbn13, rating, description,
                     review, spoiler, quotes, private_notes, on_kindle, owned)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertYear = db.prepare("INSERT OR IGNORE INTO book_years (book_id, year) VALUES (?, ?)");
const upsertShelf = db.prepare("INSERT INTO shelves (name, position) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET name = name RETURNING id");
const insertBookShelf = db.prepare("INSERT OR IGNORE INTO book_shelves (book_id, shelf_id) VALUES (?, ?)");
const upsertTag = db.prepare("INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO UPDATE SET name = name RETURNING id");
const insertBookTag = db.prepare("INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)");
const insertPerson = db.prepare("INSERT INTO people (first, last, relationship) VALUES (?, ?, ?) RETURNING id");
const insertRec = db.prepare("INSERT OR IGNORE INTO recommendations (book_id, person_id, kind) VALUES (?, ?, ?)");

const bookIds = new Set<number>();

transaction(() => {
  SHELF_ORDER.forEach((name, i) => upsertShelf.get(name, i));
  for (const name of EXTRA_TAGS) upsertTag.get(name);

  for (const r of rows) {
    const id = Number(r["Book Id"]);
    const author = (r["Author"] ?? "").trim().replace(/\s+/g, " ");
    const rawIsbn = (r["ISBN13"] ?? "").trim();
    const isbn = toIsbn13(rawIsbn);
    if (rawIsbn && !isbn) warnings.push(`#${id} "${r["Title"]}": dropped invalid ISBN "${rawIsbn}"`);
    const rating = Number(r["My Rating"]) || null;

    insertBook.run(
      id,
      r["Title"].trim(),
      author,
      authorSort(author),
      (r["Additional Authors"] ?? "").trim(),
      isbn,
      rating,
      r["Book Description"] ?? "",
      r["My Review"] ?? "",
      r["Spoiler"] ?? "",
      r["Quotes"] ?? "",
      r["Private Notes"] ?? "",
      checked(r["On Kindle?"]),
      checked(r["Owned?"]),
    );
    bookIds.add(id);

    for (const y of list(r["Year Read"])) insertYear.run(id, Number(y));
    for (const s of list(r["Bookshelves"])) {
      const { id: shelfId } = upsertShelf.get(s, SHELF_ORDER.length) as { id: number };
      insertBookShelf.run(id, shelfId);
    }
    for (const t of list(r["Tags"])) {
      const { id: tagId } = upsertTag.get(t) as { id: number };
      insertBookTag.run(id, tagId);
    }
  }

  // People links come from the People table, not the CSV, because the CSV only
  // has first names and two pairs of people share one.
  for (const p of people) {
    const { id: personId } = insertPerson.get(p.first, p.last, p.rel) as { id: number };
    for (const [kind, ids] of [["for", p.for], ["by", p.by]] as const) {
      for (const b of list(ids).map(Number)) {
        if (bookIds.has(b)) insertRec.run(b, personId, kind);
        else warnings.push(`${p.first} ${p.last}: linked book #${b} isn't in the CSV`);
      }
    }
  }
});

// Covers are processed outside the transaction since sharp is async.
const coverDir = path.join(DATA_DIR, "airtable-covers");
const coverFiles = fs.existsSync(coverDir) ? fs.readdirSync(coverDir) : [];
const setCover = db.prepare("UPDATE books SET cover = ? WHERE id = ?");
let covers = 0;
for (const file of coverFiles) {
  const id = Number(path.parse(file).name);
  if (!bookIds.has(id)) continue;
  try {
    const name = await saveCover(id, fs.readFileSync(path.join(coverDir, file)));
    if (name) {
      setCover.run(name, id);
      covers++;
    } else warnings.push(`#${id}: cover ${file} was a placeholder, skipped`);
  } catch (err) {
    warnings.push(`#${id}: couldn't read cover ${file} (${(err as Error).message})`);
  }
}

const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
console.log(`Imported ${bookIds.size} books, ${covers} covers, ${count("SELECT count(*) n FROM tags")} tags, ` +
  `${count("SELECT count(*) n FROM people")} people, ${count("SELECT count(*) n FROM recommendations")} recommendations.`);
if (warnings.length) console.log(`\n${warnings.length} warnings:\n  ` + warnings.join("\n  "));
