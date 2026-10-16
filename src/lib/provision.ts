import "server-only";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, prepareLibrary, type Library } from "./db";

/**
 * Makes a new, empty library database for someone joining. On a hosted copy that's a Turso
 * database, made through Turso's Platform API (TURSO_API_TOKEN and TURSO_ORG; TURSO_GROUP picks
 * the group, "default" otherwise). On your own computer, without those, it's a file in
 * DATA_DIR/libraries.
 */

const API = "https://api.turso.tech/v1/organizations";

export type NewDatabase = { name: string; url: string; token: string | null };

function turso() {
  const token = process.env.TURSO_API_TOKEN;
  const org = process.env.TURSO_ORG;
  return token && org ? { token, org, group: process.env.TURSO_GROUP || "default" } : null;
}

async function call(method: string, url: string, body?: unknown) {
  const t = turso()!;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${t.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Turso ${method} ${new URL(url).pathname} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Creates the database and sets up its tables. */
export async function createLibraryDatabase(): Promise<NewDatabase> {
  const name = `bookbox-${randomBytes(5).toString("hex")}`;
  const t = turso();
  let db: NewDatabase;
  if (t) {
    const created = await call("POST", `${API}/${t.org}/databases`, { name, group: t.group });
    const hostname = created?.database?.Hostname;
    if (!hostname) throw new Error("Turso didn't say where the new database is.");
    const { jwt } = await call("POST", `${API}/${t.org}/databases/${name}/auth/tokens?authorization=full-access`);
    db = { name, url: `libsql://${hostname}`, token: jwt };
  } else if (process.env.VERCEL) {
    throw new Error("Set TURSO_API_TOKEN and TURSO_ORG so BookBox can make a database for each person.");
  } else {
    const dir = path.join(DATA_DIR, "libraries");
    fs.mkdirSync(dir, { recursive: true });
    db = { name, url: `file:${path.join(dir, `${name}.db`)}`, token: null };
  }
  try {
    await prepareLibrary(asLibrary(db, null));
  } catch (err) {
    await deleteLibraryDatabase(db).catch(() => {});
    throw err;
  }
  return db;
}

export const asLibrary = (db: NewDatabase, accountId: number | null): Library => ({ accountId, url: db.url, authToken: db.token ?? undefined });

/** Removes a database made for someone whose sign-up then failed. */
export async function deleteLibraryDatabase(db: NewDatabase) {
  const t = turso();
  if (t && db.url.startsWith("libsql:")) await call("DELETE", `${API}/${t.org}/databases/${db.name}`);
  else if (db.url.startsWith("file:")) for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(db.url.slice(5) + suffix, { force: true });
}
