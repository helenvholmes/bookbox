import { NextResponse, type NextRequest } from "next/server";
import { getBookForCoverSearch } from "@/lib/books";
import { findCoverCandidates } from "@/lib/openlibrary";

// GET ?id=<book id>  cover options from OpenLibrary for that book
export async function GET(req: NextRequest) {
  const book = getBookForCoverSearch(Number(req.nextUrl.searchParams.get("id")));
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  try {
    return NextResponse.json(await findCoverCandidates(book));
  } catch {
    return NextResponse.json({ error: "OpenLibrary didn't respond. Try again in a moment." }, { status: 502 });
  }
}
