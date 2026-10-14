"use server";

import { revalidatePath } from "next/cache";
import { cleanGoodreadsBook, fetchImportedCovers, findMatches, importGoodreadsBooks, parseGoodreadsCsv, type GoodreadsBook } from "@/lib/goodreads";
import { cleanLibbyBook, type LibbyBook } from "@/lib/libby";
import { fetchLibbyCovers, importLibbyBooks } from "@/lib/libby-import";
import { saveSettings } from "@/lib/settings";

export type SettingsState = { savedAt?: number } | null;

export async function saveSettingsAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  await saveSettings({ ownerName: String(fd.get("owner_name") ?? ""), publicHome: fd.get("public_home") === "on" });
  revalidatePath("/", "layout");
  return { savedAt: Date.now() };
}

const KEY = /^[A-Za-z0-9]{16,64}$/;

export type SpotifyKeysState = { error?: string } | null;

/** Saves the Spotify app's keys from Settings. */
export async function saveSpotifyKeysAction(_prev: SpotifyKeysState, fd: FormData): Promise<SpotifyKeysState> {
  const { saveSpotifyCredentials } = await import("@/lib/spotify");
  const clientId = String(fd.get("client_id") ?? "").trim();
  const clientSecret = String(fd.get("client_secret") ?? "").trim();
  if (!KEY.test(clientId) || !KEY.test(clientSecret)) return { error: "Those don’t look like Spotify keys. Copy the Client ID and Client secret from your app’s settings." };
  await saveSpotifyCredentials({ clientId, clientSecret });
  revalidatePath("/settings");
  return null;
}

/** Forgets the app's keys (and disconnects, since the connection can't be refreshed without them). */
export async function removeSpotifyKeysAction() {
  const { disconnectSpotify, saveSpotifyCredentials } = await import("@/lib/spotify");
  await disconnectSpotify();
  await saveSpotifyCredentials(null);
  revalidatePath("/", "layout");
}

export type HardcoverTokenState = { error?: string } | null;

/** Saves the Hardcover API token from Settings, after checking Hardcover takes it. */
export async function saveHardcoverTokenAction(_prev: HardcoverTokenState, fd: FormData): Promise<HardcoverTokenState> {
  const { checkHardcoverToken, saveHardcoverToken, HardcoverError } = await import("@/lib/hardcover");
  const token = String(fd.get("token") ?? "").trim();
  if (token.length < 20 || /\s/.test(token.replace(/^bearer /i, ""))) return { error: "That doesn’t look like a Hardcover token. Copy it from hardcover.app/account/api." };
  try {
    await checkHardcoverToken(token);
  } catch (e) {
    return { error: e instanceof HardcoverError ? e.message : "Couldn’t reach Hardcover to check the token. Try again in a minute." };
  }
  await saveHardcoverToken(token);
  revalidatePath("/", "layout");
  return null;
}

export async function removeHardcoverTokenAction() {
  const { saveHardcoverToken } = await import("@/lib/hardcover");
  await saveHardcoverToken(null);
  revalidatePath("/", "layout");
}

// API keys for other apps (see src/lib/api-keys.ts).

export type ApiKeyState = { key?: string; name?: string; error?: string } | null;

/** Makes a key and hands it back once, to copy into the app. */
export async function createApiKeyAction(_prev: ApiKeyState, fd: FormData): Promise<ApiKeyState> {
  const { createApiKey, parseOrigins } = await import("@/lib/api-keys");
  const name = String(fd.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { error: "Name the key after the app that will use it, like “Scriptable widget”." };
  const parsed = parseOrigins(String(fd.get("origins") ?? ""));
  if ("error" in parsed) return { error: parsed.error };
  const key = await createApiKey(name, parsed.origins);
  revalidatePath("/settings");
  return { key, name };
}

export type ApiKeyOriginsState = { error?: string; savedAt?: number } | null;

export async function saveApiKeyOriginsAction(_prev: ApiKeyOriginsState, fd: FormData): Promise<ApiKeyOriginsState> {
  const { parseOrigins, setApiKeyOrigins } = await import("@/lib/api-keys");
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return { error: "That key is gone." };
  const parsed = parseOrigins(String(fd.get("origins") ?? ""));
  if ("error" in parsed) return { error: parsed.error };
  await setApiKeyOrigins(id, parsed.origins);
  revalidatePath("/settings");
  return { savedAt: Date.now() };
}

export async function deleteApiKeyAction(fd: FormData) {
  const { deleteApiKey } = await import("@/lib/api-keys");
  const id = Number(fd.get("id"));
  if (Number.isInteger(id)) await deleteApiKey(id);
  revalidatePath("/settings");
}

// Goodreads import (see src/lib/goodreads.ts). The browser drives it a batch at a time.

export async function previewGoodreadsAction(csv: string): Promise<{ books?: GoodreadsBook[]; error?: string }> {
  if (typeof csv !== "string" || csv.length > 9_000_000) return { error: "That file is too big." };
  const parsed = parseGoodreadsCsv(csv);
  if (typeof parsed === "string") return { error: parsed };
  if (!parsed.length) return { error: "There are no books in that file." };
  return { books: await findMatches(parsed) };
}

export async function importGoodreadsAction(books: unknown[]): Promise<{ id: number; isbn13: string | null }[]> {
  const clean = (Array.isArray(books) ? books.slice(0, 50) : []).map(cleanGoodreadsBook).filter((b): b is GoodreadsBook => b !== null);
  return importGoodreadsBooks(clean);
}

export async function goodreadsCoversAction(books: { id: number; isbn13: string }[]): Promise<number> {
  const clean = (Array.isArray(books) ? books.slice(0, 12) : []).filter((b) => Number.isInteger(b?.id) && typeof b.isbn13 === "string" && /^97[89]\d{10}$/.test(b.isbn13));
  return fetchImportedCovers(clean);
}

export async function finishImportAction() {
  revalidatePath("/", "layout");
}

// Libby import (see src/lib/libby.ts). The browser reads the file; these check and add the books.

export async function previewLibbyAction(books: unknown[]): Promise<{ books?: LibbyBook[]; error?: string }> {
  if (!Array.isArray(books) || books.length > 20_000) return { error: "That file is too big." };
  const clean = books.map(cleanLibbyBook).filter((b): b is LibbyBook => b !== null);
  if (!clean.length) return { error: "There are no books in that file." };
  return { books: await findMatches(clean) };
}

export async function importLibbyAction(books: unknown[]): Promise<{ id: number; isbn13: string | null; coverUrl: string | null }[]> {
  const clean = (Array.isArray(books) ? books.slice(0, 50) : []).map(cleanLibbyBook).filter((b): b is LibbyBook => b !== null);
  return importLibbyBooks(clean);
}

export async function libbyCoversAction(books: { id: number; isbn13: string | null; coverUrl: string | null }[]): Promise<number> {
  const clean = (Array.isArray(books) ? books.slice(0, 12) : [])
    .filter((b) => Number.isInteger(b?.id))
    .map((b) => ({
      id: b.id,
      isbn13: typeof b.isbn13 === "string" && /^97[89]\d{10}$/.test(b.isbn13) ? b.isbn13 : null,
      coverUrl: typeof b.coverUrl === "string" ? b.coverUrl.slice(0, 2000) : null,
    }));
  return fetchLibbyCovers(clean);
}
