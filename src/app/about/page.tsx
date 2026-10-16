import { cookies } from "next/headers";
import { connection } from "next/server";
import { Landing, LANDING_METADATA } from "@/components/Landing";
import { authEnabled, isValidSession, SESSION_COOKIE } from "@/lib/auth";

export const metadata = LANDING_METADATA;

/**
 * The page about BookBox at an address of its own, so it can be seen (and linked to) while signed
 * in, where the front page goes to the library instead.
 */
export default async function About() {
  await connection();
  const signedIn = !authEnabled() || (await isValidSession((await cookies()).get(SESSION_COOKIE)?.value));
  return <Landing signedIn={signedIn} />;
}
