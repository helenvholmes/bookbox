import { NextResponse, type NextRequest } from "next/server";
import { findBookByIsbn } from "@/lib/books";
import { toIsbn13 } from "@/lib/names";

// GET ?isbn=...  the book already in the library with this ISBN, or null
export async function GET(req: NextRequest) {
  const isbn = toIsbn13(req.nextUrl.searchParams.get("isbn"));
  return NextResponse.json(isbn ? (findBookByIsbn(isbn) ?? null) : null);
}
