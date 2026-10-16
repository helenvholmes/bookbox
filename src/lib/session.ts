import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getAccount, type Account } from "./accounts";
import { authEnabled, readSession, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "./auth";

// When each account's sessions were last signed out (or null for an account that's gone), per server
// instance for CHECK_MS, so the proxy needn't ask the database on every request. A password change on
// another instance reaches this one within that time.
const CHECK_MS = 30_000;
const g = globalThis as unknown as { bookboxSignedOut?: Map<number, { at: number; signedOutAt: number | null }> };
const signedOut = (g.bookboxSignedOut ??= new Map());

/**
 * Whether a sign-in cookie should let a request through: genuine, for an account that still
 * exists, and issued after that account's sessions were last signed out. Used by the proxy, before
 * any page or action runs.
 */
export async function sessionIsCurrent(token: string | undefined): Promise<boolean> {
  if (!authEnabled()) return true;
  const session = await readSession(token);
  if (!session) return false;
  let entry = signedOut.get(session.accountId);
  if (!entry || Date.now() - entry.at > CHECK_MS) {
    const account = await getAccount(session.accountId);
    entry = { at: Date.now(), signedOutAt: account ? account.signedOutAt : null };
    signedOut.set(session.accountId, entry);
  }
  return entry.signedOutAt !== null && session.issuedAt >= entry.signedOutAt;
}

/**
 * The signed-in account, or null when signed out, the account is gone, or its sessions were signed
 * out (a password change) after this cookie was issued.
 */
export const currentAccount = cache(async (): Promise<Account | null> => {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const account = await getAccount(session.accountId);
  return account && session.issuedAt >= account.signedOutAt ? account : null;
});

export async function startSession(accountId: number, issuedAt = Date.now()) {
  signedOut.delete(accountId); // a password change here applies here straight away
  (await cookies()).set(SESSION_COOKIE, await sessionToken(accountId, issuedAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/" });
}
