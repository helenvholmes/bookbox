"use server";

import { revalidatePath } from "next/cache";
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
