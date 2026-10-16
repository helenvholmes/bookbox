import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db, mainLibrary, withLibrary, type Library } from "./db";
import { apiKeyGone, apiKeyLibrary, apiKeyMade, apiKeyOriginsChanged, listedOrigins } from "./owners";

/**
 * Keys for /api/v1, made and revoked in Settings, one per app (the Scriptable widget, another site…).
 * A key is shown once when it's made; after that only its SHA-256 hash and first characters are kept.
 * Keys are long and random, so looking one up by its hash is safe.
 */

export type ApiKey = { id: number; name: string; prefix: string; origins: string[]; createdAt: string; lastUsedAt: string | null };

const hash = (key: string) => createHash("sha256").update(key).digest("hex");
const splitOrigins = (s: string) => s.split(" ").filter(Boolean);

export async function listApiKeys(): Promise<ApiKey[]> {
  const rows = (await db.prepare("SELECT id, name, prefix, origins, created_at, last_used_at FROM api_keys ORDER BY id").all()) as {
    id: number;
    name: string;
    prefix: string;
    origins: string;
    created_at: string;
    last_used_at: string | null;
  }[];
  return rows.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, origins: splitOrigins(r.origins), createdAt: r.created_at, lastUsedAt: r.last_used_at }));
}

/** Makes a key and returns it in full. This is the only time it's available. */
export async function createApiKey(name: string, origins: string[]): Promise<string> {
  const key = `bbx_${randomBytes(24).toString("base64url")}`;
  await db.prepare("INSERT INTO api_keys (name, hash, prefix, origins) VALUES (?, ?, ?, ?)").run(name, hash(key), key.slice(0, 10), origins.join(" "));
  await apiKeyMade(hash(key), origins);
  return key;
}

const hashOf = async (id: number) => ((await db.prepare("SELECT hash FROM api_keys WHERE id = ?").get(id)) as { hash: string } | undefined)?.hash;

export async function setApiKeyOrigins(id: number, origins: string[]) {
  await db.prepare("UPDATE api_keys SET origins = ? WHERE id = ?").run(origins.join(" "), id);
  const h = await hashOf(id);
  if (h) await apiKeyOriginsChanged(h, origins);
}

export async function deleteApiKey(id: number) {
  const h = await hashOf(id);
  await db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
  if (h) await apiKeyGone(h);
}

/**
 * The key's row and the library it belongs to, from an "Authorization: Bearer bbx_…" header, or
 * null. Runs before anything else in the request, so it looks the library up itself.
 */
export async function findApiKey(authorization: string | null): Promise<{ id: number; origins: string[]; library: Library } | null> {
  const key = authorization?.match(/^Bearer\s+(bbx_[\w-]{20,})$/i)?.[1];
  if (!key) return null;
  const library = await apiKeyLibrary(hash(key));
  if (!library) return null;
  const row = (await withLibrary(library, () => db.prepare("SELECT id, origins FROM api_keys WHERE hash = ?").get(hash(key)))) as
    | { id: number; origins: string }
    | undefined;
  return row ? { id: row.id, origins: splitOrigins(row.origins), library } : null;
}

/** Notes that a key was used, at most once an hour, so Settings can show which keys are still in use. */
export async function touchApiKey(id: number) {
  await db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ? AND (last_used_at IS NULL OR last_used_at < datetime('now', '-1 hour'))").run(id);
}

/** Every website any key allows, for answering browsers' preflight checks (which arrive without the key). */
export async function allAllowedOrigins(): Promise<Set<string>> {
  // Keys listed with their account, and the main library's own (including keys made before accounts).
  const rows = (await withLibrary(mainLibrary(), () => db.prepare("SELECT origins FROM api_keys").all())) as { origins: string }[];
  return new Set([...rows.flatMap((r) => splitOrigins(r.origins)), ...(await listedOrigins())]);
}

/** Cleans up what was typed in Settings: one website per line or separated by spaces, as https://example.com. */
export function parseOrigins(input: string): { origins: string[] } | { error: string } {
  const origins = new Set<string>();
  for (const part of input.split(/[\s,]+/).filter(Boolean)) {
    let url: URL;
    try {
      url = new URL(part);
    } catch {
      return { error: `“${part}” isn’t a web address. Use the form https://example.com.` };
    }
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return { error: `“${part}” needs to start with https:// (http:// is fine for localhost).` };
    origins.add(url.origin);
  }
  return { origins: [...origins].slice(0, 20) };
}
