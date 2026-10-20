/**
 * The public demo at demo.bookbox.lol (BOOKBOX_DEMO=1): anyone can try BookBox without signing up.
 * Each visitor gets a throwaway library of their own, a SQLite file in the server's temporary folder
 * made from a snapshot (see demo-library.ts), named by a random id in a browser-session cookie.
 *
 * The demo must never reach a real library, so it refuses to run with any database, storage or
 * Spotify keys set: with none, there is nothing real it could write to, whatever a bug does.
 *
 * Runs in the proxy as well as the server, so it only uses Web Crypto.
 */

export const DEMO_COOKIE = "bookbox_demo";

export const demoMode = () => process.env.BOOKBOX_DEMO === "1";

/** Hosts the demo may answer on: its own, previews on Vercel, and this computer. */
export function demoHostAllowed(host: string | null) {
  if (process.env.NODE_ENV === "development") return true; // a phone on the same network, too
  const name = (host ?? "").replace(/:\d+$/, "").toLowerCase();
  return name === "demo.bookbox.lol" || name.endsWith(".vercel.app") || name === "localhost" || name === "127.0.0.1";
}

// Anything that would connect the demo to a real library, its covers or someone's accounts.
const FORBIDDEN_PREFIXES = ["TURSO_", "ACCOUNTS_", "R2_", "BLOB_", "SPOTIFY_"];
const FORBIDDEN = ["BOOKBOX_PASSWORD", "BOOKBOX_SECRET"];

/** Throws when the demo is on alongside keys for anything real, so it never starts that way. */
export function checkDemoEnvironment() {
  if (!demoMode()) return;
  const set = Object.keys(process.env)
    .filter((k) => process.env[k] && (FORBIDDEN.includes(k) || FORBIDDEN_PREFIXES.some((p) => k.startsWith(p))))
    .sort();
  if (set.length) {
    throw new Error(`BOOKBOX_DEMO is on, so these must not be set (the demo must never reach a real library): ${set.join(", ")}`);
  }
}

const ID = /^[0-9a-f]{32}$/;

export const isDemoId = (id: string | undefined): id is string => !!id && ID.test(id);

export function newDemoId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}
