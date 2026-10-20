import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { checkDemoEnvironment, DEMO_COOKIE, demoHostAllowed, demoMode, isDemoId, newDemoId } from "@/lib/demo";
import { sessionIsCurrent } from "@/lib/session";

export async function proxy(request: NextRequest) {
  if (demoMode()) return demo(request);
  if (await sessionIsCurrent(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/" && next !== "/library") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

/** The demo has no signing in: a first visit gets a throwaway library of its own, named by a cookie. */
function demo(request: NextRequest) {
  checkDemoEnvironment();
  if (!demoHostAllowed(request.headers.get("host"))) return new NextResponse("This copy of BookBox is the demo, which only runs at demo.bookbox.lol.", { status: 421 });
  if (isDemoId(request.cookies.get(DEMO_COOKIE)?.value)) return NextResponse.next();
  const id = newDemoId();
  // The page this request renders reads the cookie too, so it goes on the request as well as the response.
  request.cookies.set(DEMO_COOKIE, id);
  const response = NextResponse.next({ request: { headers: request.headers } });
  // No maxAge: the browser forgets it (and so the library) when it closes.
  response.cookies.set(DEMO_COOKIE, id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  return response;
}

export const config = {
  // Everything except the front page and /about (they check the session themselves: your library or the page
  // about BookBox when signed in, otherwise the page about BookBox or sign-in), the login and sign-up pages,
  // invite links (/join/…, which check their own code), public share links (/s/…), the offline page and service
  // worker (which hold no data themselves), the assets the home screen needs before signing in, the
  // public-domain covers on the page about BookBox and in the demo, Vercel's Speed Insights script and reports
  // (/_vercel/…), and the API for other apps (/api/v1/…), which checks its own keys (src/lib/api.ts).
  matcher: [
    "/((?!$|about$|login|signup$|join/|s/|offline|sw\\.js|_next/static|_next/image|manifest.webmanifest|favicon.ico|icon|apple-icon|icons/|splash/|landing/|demo-covers/|_vercel/|api/v1/).*)",
  ],
};
