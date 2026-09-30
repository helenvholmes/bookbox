import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Landing, LANDING_METADATA } from "@/components/Landing";
import { authEnabled, isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const metadata = LANDING_METADATA;

/**
 * The page about BookBox at an address of its own, so it can be seen (and linked to) while signed
 * in, where the front page goes to the library instead. Signed out, it follows the same setting
 * as the front page.
 */
export default async function About() {
  await connection();
  const signedIn = !authEnabled() || (await isValidSession((await cookies()).get(SESSION_COOKIE)?.value));
  if (!signedIn && !(await getSettings()).publicHome) redirect("/login");
  return <Landing signedIn={signedIn} />;
}
