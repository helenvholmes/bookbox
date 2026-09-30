import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Landing } from "@/components/Landing";
import { authEnabled, isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: { absolute: "BookBox · A free reading log you host yourself" },
  description:
    "Track what you read, re-read and want to read. Instant search, offline mode, barcode scanning, shareable lists and Spotify audiobook progress. Open source, and free to host.",
  openGraph: {
    title: "BookBox",
    description: "A free reading log you host yourself: instant search, offline mode, shareable lists and Spotify audiobook progress.",
    type: "website",
  },
};

/**
 * The site's front page. Signed in, it's your library (keeping any filters, so old links like
 * "/?shelf=Read" still work). Signed out, it's the page about BookBox when that's turned on in
 * Settings, and the sign-in page when it isn't.
 */
export default async function Home(props: PageProps<"/">) {
  await connection();
  const signedIn = await isValidSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (signedIn) {
    const sp = await props.searchParams;
    const query = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v === undefined ? [] : [[k, v]])));
    redirect(query.size ? `/library?${query}` : "/library");
  }
  // Without a password there's no signing in (a copy running on your own computer): always the library.
  if (!authEnabled()) redirect("/library");
  if (!(await getSettings()).publicHome) redirect("/login");
  return <Landing />;
}
