"use server";

import { redirect, RedirectType } from "next/navigation";
import { createAccount, findAccountByEmail, hasAccounts, looksLikeEmail } from "@/lib/accounts";
import { checkSetupPassword } from "@/lib/auth";
import { lockedOutFor, recordFailure } from "@/lib/login-limit";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { endSession, startSession } from "@/lib/session";

// Checked against when there's no such account, so a wrong email takes as long as a wrong password.
let decoy: Promise<string> | undefined;

/** The error to show, and the email to keep in its field (React clears a form after its action). */
export type LoginState = { error: string; email: string } | undefined;

export async function loginAction(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get("email") ?? "").trim();
  const wait = await lockedOutFor();
  if (wait) return { error: `Too many wrong passwords. Try again in ${wait} ${wait === 1 ? "minute" : "minutes"}.`, email };
  const password = String(fd.get("password") ?? "");

  let accountId: number | null = null;
  if (!(await hasAccounts())) {
    // The first sign-in claims the library: any email, with the password set on the host.
    if (!looksLikeEmail(email)) return { error: "Enter your email address. It becomes your sign-in from now on.", email };
    if (await checkSetupPassword(password)) accountId = await createAccount(email, await hashPassword(password));
  } else {
    const account = await findAccountByEmail(email);
    const ok = await verifyPassword(password, account?.passwordHash ?? (await (decoy ??= hashPassword("decoy password"))));
    if (account && ok) accountId = account.id;
  }

  if (accountId === null) {
    await recordFailure();
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return { error: "That email and password don’t match.", email };
  }
  // Failures aren't cleared on success: someone with an account of their own could otherwise sign
  // into it between guesses at someone else's password, and never be locked out.
  await startSession(accountId);
  redirect(sameSitePath(String(fd.get("next") ?? "")), RedirectType.replace);
}

/** Where to go after signing in: a path on this site, or the library. Browsers drop tabs and newlines from addresses, so "/\t/evil.com" would leave the site; resolving it the same way catches that. */
function sameSitePath(next: string) {
  try {
    const url = new URL(next, "https://bookbox.invalid");
    if (next.startsWith("/") && url.origin === "https://bookbox.invalid") return url.pathname + url.search + url.hash;
  } catch {}
  return "/library";
}

/** Signs this device out by removing its sign-in cookie. (The page clears its offline copies first; see SignOutButton.) */
export async function signOutAction() {
  await endSession();
}
