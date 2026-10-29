import "server-only";
import { after, type NextRequest } from "next/server";
import { allAllowedOrigins, findApiKey, touchApiKey } from "./api-keys";
import { db, withLibrary } from "./db";
import { demoMode } from "./demo";
import { goalPace } from "./goal";
import { booksReadIn, getGoal, getStats } from "./stats";

/**
 * /api/v1: read-only JSON for other apps (the Scriptable widget, your other sites), signed in with a key
 * from Settings instead of the session cookie. The sign-in check in proxy.ts skips these routes, so every
 * handler goes through apiRoute. Described for people using it in docs/api.md.
 */

type ErrorCode = "unauthorized" | "origin_not_allowed" | "bad_request" | "not_found" | "server_error";

export function apiError(status: number, code: ErrorCode, message: string, headers?: HeadersInit) {
  return Response.json({ error: { code, message } }, { status, headers });
}

function corsHeaders(origin: string): Record<string, string> {
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Expose-Headers": "Content-Type", Vary: "Origin" };
}

/** Checks the key (and, from a browser, that the key allows that website), then runs the handler with CORS headers added. */
export function apiRoute<C>(handler: (request: NextRequest, ctx: C) => Promise<Response>) {
  return async (request: NextRequest, ctx: C): Promise<Response> => {
    if (demoMode()) return apiError(404, "not_found", "The demo has no API.");
    const origin = request.headers.get("origin");
    const key = await findApiKey(request.headers.get("authorization"));
    if (!key) {
      // Let an allowed website read the error, so its code can tell you the key is wrong.
      const headers = origin && (await allAllowedOrigins()).has(origin) ? corsHeaders(origin) : undefined;
      return apiError(401, "unauthorized", "Send an API key from BookBox’s Settings as “Authorization: Bearer bbx_…”.", headers);
    }
    if (origin && !key.origins.includes(origin)) {
      return apiError(403, "origin_not_allowed", `This key isn’t allowed on ${origin}. Add the website to the key in BookBox’s Settings.`);
    }
    after(() => withLibrary(key.library, () => touchApiKey(key.id)));

    let response: Response;
    try {
      response = await withLibrary(key.library, () => handler(request, ctx));
    } catch (e) {
      console.error("api/v1", request.nextUrl.pathname, e);
      response = apiError(500, "server_error", "Something went wrong reading your library.");
    }
    if (origin) for (const [k, v] of Object.entries(corsHeaders(origin))) response.headers.set(k, v);
    return response;
  };
}

/**
 * Browsers ask before sending the key from another website. The question arrives without the key, so this
 * allows any website that some key allows; the real request is then checked against its own key.
 */
export async function preflight(request: NextRequest) {
  if (demoMode()) return new Response(null, { status: 404 });
  const origin = request.headers.get("origin");
  const headers = new Headers({ Allow: "GET, OPTIONS", Vary: "Origin" });
  if (origin && (await allAllowedOrigins()).has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return new Response(null, { status: 204, headers });
}

/** JSON that apps may keep for a minute, but shared caches never store. */
export function apiJson(data: unknown) {
  return Response.json(data, { headers: { "Cache-Control": "private, max-age=60", Vary: "Authorization, Origin" } });
}

/** SQLite's "2026-10-14 08:12:00" (UTC) as ISO 8601. */
const isoTime = (s: string | null) => (s ? `${s.replace(" ", "T")}Z` : null);

/** The year from ?year=, this year without one, or a 400 response. */
export function yearParam(request: NextRequest): number | Response {
  const raw = request.nextUrl.searchParams.get("year");
  const thisYear = new Date().getFullYear();
  if (raw === null || raw === "" || raw === "latest") return thisYear;
  const year = Number(raw);
  if (!/^\d{4}$/.test(raw) || year < 1900 || year > thisYear + 1) return apiError(400, "bad_request", `year should be a year up to ${thisYear + 1}, like ?year=${thisYear - 1}.`);
  return year;
}

function goalFor(year: number, target: number | null, read: number) {
  const pace = goalPace(year, target, read);
  return { target, read, percent: pace?.percent ?? null, expected: pace?.expected ?? null, status: pace?.status ?? null };
}

export async function getReading(origin: string) {
  const rows = (await db
    .prepare(
      `SELECT b.id, b.title, b.author, b.cover, b.pages, b.started_on, p.percent, p.page, p.source, p.updated_at
       FROM books b
       JOIN book_shelves bs ON bs.book_id = b.id JOIN shelves s ON s.id = bs.shelf_id AND s.name = 'Currently Reading'
       LEFT JOIN book_progress p ON p.book_id = b.id
       ORDER BY coalesce(p.updated_at, b.started_on, '') DESC, b.id DESC`,
    )
    .all()) as {
    id: number;
    title: string;
    author: string;
    cover: string | null;
    pages: number | null;
    started_on: string | null;
    percent: number | null;
    page: number | null;
    source: "manual" | "spotify" | null;
    updated_at: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    author: r.author,
    pages: r.pages,
    startedOn: r.started_on,
    progress: r.percent === null ? null : { percent: Math.round(r.percent * 10) / 10, page: r.page, source: r.source, updatedAt: isoTime(r.updated_at) },
    coverUrl: r.cover ? `${origin}/api/v1/covers/${r.cover}` : null,
    url: `${origin}/books/${r.id}`,
  }));
}

export function appLinks(origin: string) {
  return { addBook: `${origin}/books/new`, scan: `${origin}/books/new?scan=1`, library: `${origin}/library`, stats: `${origin}/stats` };
}

export async function getApiStats(year: number, origin: string) {
  const s = await getStats(year);
  return {
    year: s.year,
    goal: goalFor(s.year, s.goal, s.readThisYear),
    pages: s.totals.pagesThisYear,
    totals: { books: s.totals.books, read: s.totals.read, rereads: s.totals.rereads, averageRating: s.totals.avgRating, abandoned: s.totals.abandoned },
    perYear: s.perYear,
    ratings: s.ratings,
    topTags: s.topTags.map((t) => ({ name: t.label, count: t.count })),
    topAuthors: s.topAuthors.map((a) => ({ name: a.label, count: a.count, averageRating: a.avg })),
    links: { stats: `${origin}/stats`, yearInReview: `${origin}/stats/${s.year}` },
  };
}

export async function getSummary(origin: string) {
  const year = new Date().getFullYear();
  const [goal, read, reading] = await Promise.all([getGoal(year), booksReadIn(year), getReading(origin)]);
  return { year, goal: goalFor(year, goal, read), reading, links: appLinks(origin) };
}
