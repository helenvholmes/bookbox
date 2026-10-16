import type { NextRequest } from "next/server";
import { listBooks, type Filters } from "@/lib/books";

const FILTERS = ["q", "shelf", "year", "tag", "person", "rating", "owned", "sort"] as const;

/** The next batch of library books for the same filters as the page, as the grid is scrolled. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const filters: Filters = {};
  for (const k of FILTERS) filters[k] = params.get(k) ?? undefined;
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const limit = Math.min(2000, Math.max(1, Number(params.get("limit")) || 120));
  const books = await listBooks(filters);
  return Response.json({ books: books.slice(offset, offset + limit), total: books.length }, { headers: { "Cache-Control": "private, no-store" } });
}
