import "server-only";
import { cache } from "react";
import { db } from "./db";

/**
 * Preferences you change on the Settings page, kept in the database with the rest of your
 * library. (What has to exist before you can sign in, like the password and database keys, stays in
 * the host's environment variables instead.)
 */

export type Settings = {
  /** Your first name: "Hello, Sam" in the library, "A reading list from Sam" on share pages. Empty for neutral wording. */
  ownerName: string;
  /** Show visitors who aren't signed in a page about BookBox at the site's address (otherwise they get the sign-in page). */
  publicHome: boolean;
};

const DEFAULTS: Settings = { ownerName: "", publicHome: false };
const KEYS: Record<keyof Settings, string> = { ownerName: "owner_name", publicHome: "public_home" };

export const getSettings = cache(async (): Promise<Settings> => {
  const rows = (await db.prepare("SELECT key, value FROM settings").all()) as { key: string; value: string }[];
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    ownerName: byKey.get(KEYS.ownerName) ?? DEFAULTS.ownerName,
    publicHome: byKey.has(KEYS.publicHome) ? byKey.get(KEYS.publicHome) === "1" : DEFAULTS.publicHome,
  };
});

export async function saveSettings(s: Settings) {
  const set = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  await set.run(KEYS.ownerName, s.ownerName.trim().slice(0, 60));
  await set.run(KEYS.publicHome, s.publicHome ? "1" : "0");
}

/** Your name, or null for neutral wording. */
export async function ownerName(): Promise<string | null> {
  return (await getSettings()).ownerName || null;
}
