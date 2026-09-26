import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { connectSpotify, STATE_COOKIE, syncSpotify } from "@/lib/spotify";

/** Where Spotify sends you back after you approve (or decline) the connection. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (query: string) => {
    const res = NextResponse.redirect(new URL(`/spotify?${query}`, origin));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/spotify" });
    return res;
  };
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return back("error=denied");
  const state = req.cookies.get(STATE_COOKIE)?.value;
  const code = params.get("code");
  if (!code || !state || state !== params.get("state")) return back("error=state");
  try {
    await connectSpotify(code, origin);
    await syncSpotify(true).catch(() => {});
  } catch {
    return back("error=connect");
  }
  revalidatePath("/", "layout");
  return back("connected=1");
}
