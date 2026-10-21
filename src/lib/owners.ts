import "server-only";
import { accountsDb } from "./accounts";
import { demoMode } from "./demo";
import { currentLibrary, libraryFor, mainLibrary, withLibrary, type Library } from "./db";

/**
 * Public share links and API keys are used by people who aren't signed in, so the request has no
 * account to find its library by. Each link and key is listed with its account in the accounts
 * database instead. Ones made before accounts aren't listed, and belong to the main library.
 */

async function ownerLibrary(table: "share_owners" | "api_key_owners", column: "token" | "hash", value: string): Promise<Library | null> {
  const row = await accountsDb.get(`SELECT account_id FROM ${table} WHERE ${column} = ?`, value);
  return row ? libraryFor(Number(row.account_id)) : mainLibrary();
}

/** Runs fn in the library a share link belongs to (null when its account is gone). */
export async function withShareLibrary<T>(token: string, fn: () => Promise<T>): Promise<T | null> {
  if (demoMode()) return null; // the demo has no share links
  const library = await ownerLibrary("share_owners", "token", token);
  return library ? withLibrary(library, fn) : null;
}

export async function shareTokenMade(token: string) {
  const { accountId } = await currentLibrary();
  if (accountId !== null) await accountsDb.run("INSERT OR REPLACE INTO share_owners (token, account_id) VALUES (?, ?)", token, accountId);
}

export async function shareTokenGone(token: string) {
  await accountsDb.run("DELETE FROM share_owners WHERE token = ?", token);
}

/** The library an API key (by its hash) belongs to, or null when its account is gone. */
export async function apiKeyLibrary(hash: string): Promise<Library | null> {
  return ownerLibrary("api_key_owners", "hash", hash);
}

/** Lists a new key, with the websites it allows (browsers' preflight checks arrive without the key). */
export async function apiKeyMade(hash: string, origins: string[]) {
  const { accountId } = await currentLibrary();
  if (accountId !== null) await accountsDb.run("INSERT OR REPLACE INTO api_key_owners (hash, account_id, origins) VALUES (?, ?, ?)", hash, accountId, origins.join(" "));
}

export async function apiKeyOriginsChanged(hash: string, origins: string[]) {
  await accountsDb.run("UPDATE api_key_owners SET origins = ? WHERE hash = ?", origins.join(" "), hash);
}

export async function apiKeyGone(hash: string) {
  await accountsDb.run("DELETE FROM api_key_owners WHERE hash = ?", hash);
}

/** Every website any listed key allows, across libraries. */
export async function listedOrigins(): Promise<string[]> {
  const rows = await accountsDb.all("SELECT origins FROM api_key_owners");
  return rows.flatMap((r) => String(r.origins).split(" ").filter(Boolean));
}
