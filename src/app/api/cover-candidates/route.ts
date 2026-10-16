import { NextResponse, type NextRequest } from "next/server";
import { getBookForCoverSearch } from "@/lib/books";
import { toIsbn13 } from "@/lib/names";
import { findCoverCandidates } from "@/lib/openlibrary";

// GET ?id=<book id>  cover options from OpenLibrary for that book
// GET ?title=…&author=…&isbn=…  the same for details still being edited (the book form)
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const title = q.get("title")?.trim();
  const book = q.has("id")
    ? await getBookForCoverSearch(Number(q.get("id")))
    : title
      ? { title, author: q.get("author")?.trim() ?? "", isbn13: toIsbn13(q.get("isbn") ?? "") }
      : undefined;
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  try {
    return NextResponse.json(await findCoverCandidates(book));
  } catch {
    return NextResponse.json({ error: "OpenLibrary didn't respond. Try again in a moment." }, { status: 502 });
  }
}
