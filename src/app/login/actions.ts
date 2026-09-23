"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "@/lib/auth";

export async function loginAction(_prev: string | undefined, fd: FormData): Promise<string | undefined> {
  if (!(await checkPassword(String(fd.get("password") ?? "")))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return "That's not the password.";
  }
  (await cookies()).set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  const next = String(fd.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
