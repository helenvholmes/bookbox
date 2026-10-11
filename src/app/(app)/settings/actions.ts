"use server";

import { revalidatePath } from "next/cache";
import { cleanGoodreadsBook, fetchImportedCovers, findMatches, importGoodreadsBooks, parseGoodreadsCsv, type GoodreadsBook } from "@/lib/goodreads";
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

export async function finishGoodreadsImportAction() {
  revalidatePath("/", "layout");
}
