import { createHash } from "node:crypto";
import { connection } from "next/server";
import { getSearchEntries } from "@/lib/books";

/**
 * The whole library as a compact search index, for instant search and for browsing offline.
 * The ETag lets the browser revalidate it with a cheap 304 whenever the search box is focused.
 */
export async function GET(req: Request) {
  await connection();
  const body = JSON.stringify(await getSearchEntries());
  const etag = `"${createHash("sha1").update(body).digest("base64url").slice(0, 16)}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache", "Content-Type": "application/json" };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers });
}
