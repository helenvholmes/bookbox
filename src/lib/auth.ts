// Single-password auth. Runs in both proxy and server actions, so it only uses Web Crypto.

export const SESSION_COOKIE = "bookbox_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // stay signed in on the home screen app

export function authEnabled() {
  return !!process.env.BOOKBOX_PASSWORD;
}

async function hmac(message: string) {
  const secret = process.env.BOOKBOX_SECRET || process.env.BOOKBOX_PASSWORD || "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Buffer.from(sig).toString("base64url");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The cookie value is derived from the password, so changing the password signs everything out. */
export async function sessionToken() {
  return hmac(`session:${process.env.BOOKBOX_PASSWORD}`);
}

export async function isValidSession(token: string | undefined) {
  if (!authEnabled()) return true;
  return !!token && safeEqual(token, await sessionToken());
}

export async function checkPassword(password: string) {
  const expected = process.env.BOOKBOX_PASSWORD ?? "";
  // Compare HMACs so the comparison doesn't leak the password length.
  return safeEqual(await hmac(`pw:${password}`), await hmac(`pw:${expected}`));
}
