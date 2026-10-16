/**
 * Merges one book into another and deletes the copy.
 *
 *   npx tsx scripts/merge-books.mts <keepId> <dropId> ['{"rating":4,"shelves":["Read"]}']
 *
 * Defaults: empty fields on the kept book are filled from the copy; years, tags and
 * recommendations are combined; Kindle/owned are kept if either had them; the copy's cover is
 * used only if the kept book has none; "To Read" is dropped once the book is Read or
 * Currently Reading. Anything in the JSON overrides the result: any book column, plus
 * "shelves", "tags" and "years" as full lists, and "cover": "drop" to use the copy's cover.
 */

const { db, deleteBookRows, transaction } = await import("../src/lib/db");
const { deleteCover } = await import("../src/lib/covers");
const { authorSort } = await import("../src/lib/names");

const [keepId, dropId] = process.argv.slice(2, 4).map(Number);
const overrides: Record<string, unknown> = JSON.parse(process.argv[4] ?? "{}");
if (!keepId || !dropId || keepId === dropId) throw new Error("Usage: merge-books.mts <keepId> <dropId> [json]");

type Row = Record<string, string | number | null>;
const keep = (await db.prepare("SELECT * FROM books WHERE id = ?").get(keepId)) as Row | undefined;
const drop = (await db.prepare("SELECT * FROM books WHERE id = ?").get(dropId)) as Row | undefined;
if (!keep || !drop) throw new Error("Both books must exist.");

const names = async (sql: string, id: number) => ((await db.prepare(sql).all(id)) as { name: string }[]).map((r) => r.name);
const shelvesOf = (id: number) => names("SELECT s.name FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id WHERE bs.book_id = ?", id);
const tagsOf = (id: number) => names("SELECT t.name FROM book_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.book_id = ?", id);
const yearsOf = async (id: number) => ((await db.prepare("SELECT DISTINCT year FROM book_reads WHERE book_id = ?").all(id)) as { year: number }[]).map((r) => r.year);

const TEXT = ["title", "author", "additional_authors", "isbn13", "description", "review", "spoiler", "quotes", "private_notes", "publisher"];
const OTHER = ["rating", "publish_year", "pages", "ol_work", "ol_edition"];
const merged: Row = {};
for (const f of [...TEXT, ...OTHER]) {
  const empty = keep[f] === null || keep[f] === "";
  merged[f] = empty ? drop[f] : keep[f];
}
merged.on_kindle = keep.on_kindle || drop.on_kindle ? 1 : 0;
merged.owned = keep.owned || drop.owned ? 1 : 0;

let shelves = [...new Set([...(await shelvesOf(keepId)), ...(await shelvesOf(dropId))])];
if (shelves.some((s) => s === "Read" || s === "Currently Reading")) shelves = shelves.filter((s) => s !== "To Read");
let tags = [...new Set([...(await tagsOf(keepId)), ...(await tagsOf(dropId))])];
let years = [...new Set([...(await yearsOf(keepId)), ...(await yearsOf(dropId))])];

let coverFromDrop = false;
for (const [k, v] of Object.entries(overrides)) {
  if (k === "cover") coverFromDrop = v === "drop";
  else if (k === "shelves") shelves = v as string[];
  else if (k === "tags") tags = v as string[];
  else if (k === "years") years = v as number[];
  else if (k in merged) merged[k] = v as string | number | null;
  else throw new Error(`Unknown field "${k}"`);
}
merged.author_sort = authorSort(String(merged.author ?? ""));

const idFor = async (table: "shelves" | "tags", name: string) => {
  const row = (await db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name)) as { id: number } | undefined;
  if (!row) throw new Error(`No ${table.slice(0, -1)} called "${name}"`);
  return row.id;
};

const dropCover = drop.cover as string | null;
const keepCover = keep.cover as string | null;
const useDropCover = !!dropCover && (coverFromDrop || !keepCover);

await transaction(async () => {
  const cols = Object.keys(merged);
  (await db.prepare(`UPDATE books SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(
    ...cols.map((c) => merged[c]),
    keepId,
  ));
  if (useDropCover) (await db.prepare("UPDATE books SET cover = ? WHERE id = ?").run(dropCover, keepId));

  (await db.prepare("DELETE FROM book_shelves WHERE book_id = ?").run(keepId));
  for (const s of shelves) (await db.prepare("INSERT INTO book_shelves (book_id, shelf_id) VALUES (?, ?)").run(keepId, await idFor("shelves", s)));
  (await db.prepare("DELETE FROM book_tags WHERE book_id = ?").run(keepId));
  for (const t of tags) (await db.prepare("INSERT INTO book_tags (book_id, tag_id) VALUES (?, ?)").run(keepId, await idFor("tags", t)));
  // Keep every read from both copies (notes and re-reads included), then trim to the chosen years.
  (await db.prepare("UPDATE book_reads SET book_id = ? WHERE book_id = ?").run(keepId, dropId));
  const current = new Set(((await db.prepare("SELECT DISTINCT year FROM book_reads WHERE book_id = ?").all(keepId)) as { year: number }[]).map((r) => r.year));
  for (const y of current) if (!years.includes(y)) (await db.prepare("DELETE FROM book_reads WHERE book_id = ? AND year = ?").run(keepId, y));
  for (const y of years) if (!current.has(y)) (await db.prepare("INSERT INTO book_reads (book_id, year) VALUES (?, ?)").run(keepId, y));

  (await db.prepare("INSERT OR IGNORE INTO recommendations (book_id, person_id, kind) SELECT ?, person_id, kind FROM recommendations WHERE book_id = ?").run(keepId, dropId));
  await deleteBookRows(dropId);
});
// Remove whichever cover file is no longer referenced.
const unused = useDropCover ? keepCover : dropCover;
await deleteCover(unused);

const recs = (await db
  .prepare("SELECT r.kind, trim(p.first || ' ' || p.last) AS name FROM recommendations r JOIN people p ON p.id = r.person_id WHERE r.book_id = ?")
  .all(keepId)) as { kind: string; name: string }[];
const final = (await db.prepare("SELECT title, author, additional_authors, isbn13, rating FROM books WHERE id = ?").get(keepId));
console.log(JSON.stringify({ kept: keepId, deleted: dropId, ...final, shelves, years, tags, recs: recs.map((r) => `${r.kind} ${r.name}`) }, null, 1));
