/**
 * Makes the demo's snapshot (src/lib/demo-seed.ts and public/demo-covers) from a library database.
 *
 *   npm run build:demo-seed [path/to/library.db]
 *
 * Defaults to data/bookbox.db (run `npm run pull:cloud` first for a copy of your hosted library, or
 * better, point it at a small library made for the demo). Everything in the snapshot is public on
 * demo.bookbox.lol, so only the library itself is copied: private notes, people's names, settings,
 * share links, API keys and anything Spotify or Libby are left out or replaced. Tables not listed
 * here are left out, so a table added later stays out until someone decides it's safe.
 */

import fs from "node:fs";
import path from "node:path";
import { createClient, type Row } from "@libsql/client";
import { slugify } from "../src/lib/names";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = path.resolve(process.argv[2] ?? path.join(process.env.DATA_DIR ?? "data", "bookbox.db"));
if (!fs.existsSync(source)) throw new Error(`No library database at ${source}`);
const coversIn = path.join(path.dirname(source), "covers");
const coversOut = path.join(ROOT, "public", "demo-covers");
const seedOut = path.join(ROOT, "src", "lib", "demo-seed.ts");

// Sample names for the people in the library, so nobody real is named on a public site.
const FIRST = ["Katie", "Samantha", "Priya", "Maya", "Grace", "Nora", "Elena", "Hannah", "Zoe", "Ruth", "Iris", "Lena", "Amara", "Clara", "Joy", "Mei"];
const LAST = ["Alvarez", "Brennan", "Chen", "Duval", "Okafor", "Lindqvist", "Moreau", "Novak", "Patel", "Quinn", "Reyes", "Sato", "Tanaka", "Walsh"];

const slugs = new Set<string>();

type Scrub = (row: Row, index: number) => Record<string, unknown>;

/** The tables copied, parents first, and what's changed on the way. */
const TABLES: [table: string, scrub?: Scrub][] = [
  ["books", (r) => ({ ...r, private_notes: "", bad_isbn: null })],
  ["book_reads", (r) => ({ ...r, client_id: null })],
  ["goals"],
  ["series", (r) => ({ ...r, hardcover_id: null, hardcover_checked_at: null })],
  ["book_series"],
  ["shelves"],
  ["book_shelves"],
  ["tags"],
  ["book_tags"],
  [
    "people",
    (r, i) => {
      const first = FIRST[i % FIRST.length];
      const last = LAST[i % LAST.length];
      let slug = slugify(first, last);
      for (let n = 2; slugs.has(slug); n++) slug = `${slugify(first, last)}-${n}`;
      slugs.add(slug);
      return { ...r, first, last, slug };
    },
  ],
  ["recommendations"],
  ["loans"],
  ["book_progress", (r) => ({ ...r, source: "manual", position_ms: null, duration_ms: null })],
  ["author_genders"],
  ["cover_skipped"],
  ["not_duplicates"],
];

const literal = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "string") return `'${v.replaceAll("'", "''")}'`;
  throw new Error(`Can't copy a ${typeof v} into the snapshot`);
};

const client = createClient({ url: `file:${source}` });
const statements: string[] = [];
const counts: Record<string, number> = {};

fs.rmSync(coversOut, { recursive: true, force: true });
fs.mkdirSync(coversOut, { recursive: true });

for (const [table, scrub] of TABLES) {
  const rows = (await client.execute(`SELECT * FROM "${table}" ORDER BY rowid`)).rows;
  counts[table] = rows.length;
  rows.forEach((row, i) => {
    const out: Record<string, unknown> = scrub ? scrub(row, i) : { ...row };
    if (table === "books" && out.cover) {
      const file = path.basename(String(out.cover));
      const from = path.join(coversIn, file);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(coversOut, file));
      else out.cover = null;
    }
    const cols = Object.keys(out);
    statements.push(`INSERT OR IGNORE INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map((c) => literal(out[c])).join(", ")})`);
  });
}
client.close();

const madeOn = new Date().toISOString().slice(0, 10);
fs.writeFileSync(
  seedOut,
  `// The demo's snapshot (see demo-library.ts). Made by \`npm run build:demo-seed\`; edit the library and run it again rather than editing this.
// Everything here is public on demo.bookbox.lol.

/** The day the snapshot was made: a demo library's dates are moved forward by the time since. */
export const MADE_ON = ${JSON.stringify(madeOn)};

export const STATEMENTS: string[] = [
${statements.map((s) => `  ${JSON.stringify(s)},`).join("\n")}
];
`,
);

console.log(`Snapshot of ${source}, made ${madeOn}:`);
for (const [table, n] of Object.entries(counts)) console.log(`  ${table}: ${n}`);
console.log(`  covers: ${fs.readdirSync(coversOut).length}`);
