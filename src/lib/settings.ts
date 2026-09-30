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
};

const DEFAULTS: Settings = { ownerName: "" };
const KEYS: Record<keyof Settings, string> = { ownerName: "owner_name" };

export const getSettings = cache(async (): Promise<Settings> => {
  const rows = (await db.prepare("SELECT key, value FROM settings").all()) as { key: string; value: string }[];
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return { ownerName: byKey.get(KEYS.ownerName) ?? DEFAULTS.ownerName };
});

export async function saveSettings(s: Settings) {
  await db
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(KEYS.ownerName, s.ownerName.trim().slice(0, 60));
}

/** Your name, or null for neutral wording. */
export async function ownerName(): Promise<string | null> {
  return (await getSettings()).ownerName || null;
}
