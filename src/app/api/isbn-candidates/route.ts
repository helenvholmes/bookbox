import { NextResponse, type NextRequest } from "next/server";
import { getBookForCoverSearch } from "@/lib/books";
import { findIsbnCandidates } from "@/lib/openlibrary";

// GET ?id=<book id>  editions with an ISBN that could be this book
export async function GET(req: NextRequest) {
  const book = await getBookForCoverSearch(Number(req.nextUrl.searchParams.get("id")));
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  try {
    return NextResponse.json(await findIsbnCandidates(book));
  } catch {
    return NextResponse.json({ error: "OpenLibrary didn't respond. Try again in a moment." }, { status: 502 });
  }
}
