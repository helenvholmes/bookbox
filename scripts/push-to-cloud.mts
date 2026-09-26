/**
 * Copies the local library (data/bookbox.db and data/covers) to the hosted setup: the database
 * to Turso and the covers to a private Vercel Blob store.
 *
 *   TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… BLOB_READ_WRITE_TOKEN=… npm run push:cloud
 *
 * The Turso database is replaced with the local one, so run it once, before you start using the
 * hosted app (or again if you want to overwrite it). Covers that are already uploaded are skipped.
 * Either half can be run alone: leave out the Turso or Blob variables to skip it.
 */

import fs from "node:fs";
import path from "node:path";
import { createClient, type InStatement, type InValue } from "@libsql/client";

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "data");
const localFile = path.join(DATA_DIR, "bookbox.db");
if (!fs.existsSync(localFile)) throw new Error(`No local database at ${localFile}`);
const local = createClient({ url: `file:${localFile}` });

if (process.env.TURSO_DATABASE_URL) {
  // Importing the app's database module with TURSO_DATABASE_URL set creates the schema remotely.
  const { db, batch } = await import("../src/lib/db");
  await db.prepare("SELECT 1").get();

  const names = (
    await local.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  ).rows.map((r) => String(r.name));
  // Foreign keys are enforced, so parents (books, people…) go in before the rows that point at them.
  const parents = new Map<string, string[]>();
  for (const t of names) {
    parents.set(t, (await local.execute(`SELECT "table" FROM pragma_foreign_key_list('${t}')`)).rows.map((r) => String(r.table)).filter((p) => p !== t));
  }
  const tables: string[] = [];
  const visit = (t: string) => {
    if (tables.includes(t)) return;
    for (const p of parents.get(t) ?? []) if (names.includes(p)) visit(p);
    tables.push(t);
  };
  names.forEach(visit);
  const remoteTables = new Set((await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).map((r) => String(r.name)));

  // Children first when clearing, so nothing is left pointing at a deleted row.
  await batch(tables.filter((t) => remoteTables.has(t)).reverse().map((t) => `DELETE FROM "${t}"`));

  for (const table of tables) {
    if (!remoteTables.has(table)) {
      console.log(`skip ${table} (not in the app's schema)`);
      continue;
    }
    const { rows, columns } = await local.execute(`SELECT * FROM "${table}"`);
    const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
    for (let i = 0; i < rows.length; i += 200) {
      const stmts: InStatement[] = rows.slice(i, i + 200).map((r) => ({ sql, args: columns.map((c) => r[c] as InValue) }));
      await batch(stmts);
    }
    console.log(`${table}: ${rows.length} rows`);
  }
}

if (process.env.BLOB_READ_WRITE_TOKEN) {
  const { head, put } = await import("@vercel/blob");
  const coversDir = path.join(DATA_DIR, "covers");
  const referenced = (await local.execute("SELECT cover FROM books WHERE cover IS NOT NULL")).rows.map((r) => String(r.cover));
  let uploaded = 0;
  let skipped = 0;
  const queue = [...referenced];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let name = queue.shift(); name; name = queue.shift()) {
        const file = path.join(coversDir, name);
        if (!fs.existsSync(file)) {
          console.warn(`missing locally: ${name}`);
          continue;
        }
        const exists = await head(`covers/${name}`).then(
          () => true,
          () => false,
        );
        if (exists) {
          skipped++;
          continue;
        }
        await put(`covers/${name}`, fs.readFileSync(file), { access: "private", contentType: "image/webp", addRandomSuffix: false, allowOverwrite: true });
        uploaded++;
      }
    }),
  );
  console.log(`covers: ${uploaded} uploaded, ${skipped} already there`);
}

if (!process.env.TURSO_DATABASE_URL && !process.env.BLOB_READ_WRITE_TOKEN) {
  console.log("Nothing to do: set TURSO_DATABASE_URL/TURSO_AUTH_TOKEN and/or BLOB_READ_WRITE_TOKEN.");
}
