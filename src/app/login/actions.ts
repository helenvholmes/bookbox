"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "@/lib/auth";
import { clearFailures, lockedOutFor, recordFailure } from "@/lib/login-limit";

export async function loginAction(_prev: string | undefined, fd: FormData): Promise<string | undefined> {
  const wait = await lockedOutFor();
  if (wait) return `Too many wrong passwords. Try again in ${wait} ${wait === 1 ? "minute" : "minutes"}.`;
  if (!(await checkPassword(String(fd.get("password") ?? "")))) {
    await recordFailure();
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return "That's not the password.";
  }
  await clearFailures();
  (await cookies()).set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  const next = String(fd.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/");
}
