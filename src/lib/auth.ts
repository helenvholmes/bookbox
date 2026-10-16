// Session cookies. Runs in both proxy and server actions, so it only uses Web Crypto.

export const SESSION_COOKIE = "bookbox_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // stay signed in on the home screen app

/** Off for local use without a password; always on when deployed, so a missing password locks the app instead of opening it. */
export function authEnabled() {
  return !!process.env.BOOKBOX_PASSWORD || !!process.env.VERCEL;
}

/** Signs cookies. BOOKBOX_SECRET, or the password for copies set up before accounts. */
function secret() {
  return process.env.BOOKBOX_SECRET || process.env.BOOKBOX_PASSWORD || "";
}

async function hmac(message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Buffer.from(sig).toString("base64url");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type Session = { accountId: number; issuedAt: number };

/** "a.<account id>.<issued at, ms>.<signature>": who signed in and when, signed so it can't be altered. */
export async function sessionToken(accountId: number, issuedAt = Date.now()) {
  const body = `a.${accountId}.${issuedAt}`;
  return `${body}.${await hmac(`session:${body}`)}`;
}

/**
 * The session a cookie holds, when its signature checks out. Whether the account still exists and
 * hasn't signed its sessions out is checked against the database (see session.ts); the proxy only
 * checks the signature, so it needs no database.
 */
export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token || !secret()) return null;
  const m = /^(a\.(\d+)\.(\d+))\.([\w-]+)$/.exec(token);
  if (!m || !safeEqual(m[4], await hmac(`session:${m[1]}`))) return null;
  return { accountId: Number(m[2]), issuedAt: Number(m[3]) };
}

export async function isValidSession(token: string | undefined) {
  if (!authEnabled()) return true;
  return !!(await readSession(token));
}

/** The password from BOOKBOX_PASSWORD, which claims the first account (see login/actions.ts). */
export async function checkSetupPassword(password: string) {
  const expected = process.env.BOOKBOX_PASSWORD ?? "";
  if (!expected) return false;
  // Compare HMACs so the comparison doesn't leak the password length.
  return safeEqual(await hmac(`pw:${password}`), await hmac(`pw:${expected}`));
}
