"use server";

import { redirect, RedirectType } from "next/navigation";
import { createAccount, emailTaken, looksLikeEmail } from "@/lib/accounts";
import { withLibrary } from "@/lib/db";
import { inviteUsedBy, returnInvite, takeInvite } from "@/lib/invites";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { asLibrary, createLibraryDatabase, deleteLibraryDatabase, type NewDatabase } from "@/lib/provision";
import { startSession } from "@/lib/session";
import { saveSettings } from "@/lib/settings";

/** The error to show, and what was typed (React clears a form after its action). */
export type JoinState = { error: string; name: string; email: string } | undefined;

export async function joinAction(code: string, _prev: JoinState, fd: FormData): Promise<JoinState> {
  const name = String(fd.get("name") ?? "").trim().slice(0, 60);
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const fail = (error: string) => ({ error, name, email });

  if (!looksLikeEmail(email)) return fail("That doesn’t look like an email address.");
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password !== String(fd.get("confirm") ?? "")) return fail("The passwords don’t match.");
  if (await emailTaken(email)) return fail("There’s already an account with that email. Sign in instead.");
  if (!(await takeInvite(code))) return fail("This invite has been used or has expired. Ask for a new one.");

  let db: NewDatabase | null = null;
  try {
    db = await createLibraryDatabase();
    const accountId = await createAccount(email, await hashPassword(password), { url: db.url, token: db.token });
    await inviteUsedBy(code, accountId);
    if (name) await withLibrary(asLibrary(db, accountId), () => saveSettings({ ownerName: name }));
    await startSession(accountId);
  } catch (err) {
    console.error("join", err);
    if (db) await deleteLibraryDatabase(db).catch(() => {});
    await returnInvite(code);
    return fail("Something went wrong setting up your library. Try again in a minute.");
  }
  redirect("/library", RedirectType.replace);
}
