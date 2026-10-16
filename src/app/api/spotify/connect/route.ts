import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, spotifyConfigured, STATE_COOKIE } from "@/lib/spotify";

/** Starts connecting Spotify: off to Spotify's consent screen, with a state value to check on the way back. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (!(await spotifyConfigured())) return NextResponse.redirect(new URL("/settings?spotify=setup#spotify", origin));
  const state = randomBytes(16).toString("base64url");
  const res = NextResponse.redirect(await authorizeUrl(origin, state));
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), path: "/api/spotify", maxAge: 600 });
  return res;
}
