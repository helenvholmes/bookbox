import "server-only";
import { createClient, type Client, type InValue } from "@libsql/client";
import { libraryConnection } from "./db";

/**
 * Who can sign in. Each account has an email, a password hash and the library database it reads
 * (db_url; null means the main library, from TURSO_DATABASE_URL or DATA_DIR).
 *
 * Accounts live in their own database when ACCOUNTS_DATABASE_URL is set (a copy with several
 * people), and otherwise in the main library's database (a copy for one person, so it needs no
 * extra setup). Failed sign-ins are counted here too (see login-limit.ts).
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id             INTEGER PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT NOT NULL,
  db_url         TEXT,               -- the account's library database; null for the main one
  db_token       TEXT,
  signed_out_at  INTEGER NOT NULL DEFAULT 0, -- sessions issued before this (ms) are no longer valid
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Failed sign-ins per network address (hashed, never stored as-is), to slow down password guessing.
CREATE TABLE IF NOT EXISTS login_failures (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  first_at INTEGER NOT NULL
);
`;

export type Account = { id: number; email: string; dbUrl: string | null; dbToken: string | null; signedOutAt: number };

const g = globalThis as unknown as { bookboxAccounts?: Client; bookboxAccountsReady?: Promise<void> };

function client(): Client {
  g.bookboxAccounts ??= process.env.ACCOUNTS_DATABASE_URL
    ? createClient({ url: process.env.ACCOUNTS_DATABASE_URL, authToken: process.env.ACCOUNTS_AUTH_TOKEN })
    : createClient(libraryConnection());
  return g.bookboxAccounts;
}

async function run(sql: string, ...args: InValue[]) {
  g.bookboxAccountsReady ??= client()
    .executeMultiple(SCHEMA)
    .catch((err) => {
      g.bookboxAccountsReady = undefined; // retry on the next query
      throw err;
    });
  await g.bookboxAccountsReady;
  return client().execute({ sql, args });
}

export const accountsDb = {
  get: async (sql: string, ...args: InValue[]): Promise<Record<string, unknown> | undefined> => {
    const row = (await run(sql, ...args)).rows[0];
    return row && { ...row };
  },
  run: async (sql: string, ...args: InValue[]) => {
    await run(sql, ...args);
  },
};

const COLUMNS = "id, email, db_url, db_token, signed_out_at";
const toAccount = (r: Record<string, unknown> | undefined): Account | null =>
  r?.id == null
    ? null
    : { id: Number(r.id), email: String(r.email), dbUrl: (r.db_url as string) ?? null, dbToken: (r.db_token as string) ?? null, signedOutAt: Number(r.signed_out_at) };

export async function getAccount(id: number): Promise<Account | null> {
  return toAccount(await accountsDb.get(`SELECT ${COLUMNS} FROM accounts WHERE id = ?`, id));
}

/** The account and its password hash, for signing in. */
export async function findAccountByEmail(email: string): Promise<(Account & { passwordHash: string }) | null> {
  const row = await accountsDb.get(`SELECT ${COLUMNS}, password_hash FROM accounts WHERE email = ?`, normalizeEmail(email));
  const account = toAccount(row);
  return account && { ...account, passwordHash: String(row!.password_hash) };
}

export async function passwordHashFor(id: number): Promise<string | null> {
  return ((await accountsDb.get("SELECT password_hash FROM accounts WHERE id = ?", id))?.password_hash as string) ?? null;
}

export async function hasAccounts(): Promise<boolean> {
  return !!(await accountsDb.get("SELECT 1 AS one FROM accounts LIMIT 1"))?.one;
}

/** Creates an account and returns its id. Throws when the email is taken. */
export async function createAccount(email: string, passwordHash: string, db?: { url: string; token: string | null }): Promise<number> {
  const r = await run(
    "INSERT INTO accounts (email, password_hash, db_url, db_token) VALUES (?, ?, ?, ?)",
    normalizeEmail(email),
    passwordHash,
    db?.url ?? null,
    db?.token ?? null,
  );
  return Number(r.lastInsertRowid);
}

export async function setEmail(id: number, email: string) {
  await accountsDb.run("UPDATE accounts SET email = ? WHERE id = ?", normalizeEmail(email), id);
}

/** Changes the password and signs out every session issued before now. */
export async function setPassword(id: number, passwordHash: string, signedOutAt: number) {
  await accountsDb.run("UPDATE accounts SET password_hash = ?, signed_out_at = ? WHERE id = ?", passwordHash, signedOutAt, id);
}

export async function emailTaken(email: string, exceptId?: number): Promise<boolean> {
  return !!(await accountsDb.get("SELECT 1 AS one FROM accounts WHERE email = ? AND id != ?", normalizeEmail(email), exceptId ?? 0))?.one;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
