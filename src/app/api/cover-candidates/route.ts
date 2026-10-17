import { NextResponse, type NextRequest } from "next/server";
import { getBookForCoverSearch } from "@/lib/books";
import { toIsbn13 } from "@/lib/names";
import { inventaireByIsbn } from "@/lib/inventaire";
import { findCoverCandidates } from "@/lib/openlibrary";

// GET ?id=<book id>  cover options from OpenLibrary (and Inventaire, for the ISBN) for that book
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
    const [ol, inv] = await Promise.all([
      findCoverCandidates(book),
      book.isbn13 ? inventaireByIsbn(book.isbn13).catch(() => null) : null,
    ]);
    const url = inv?.coverUrl;
    if (!url) return NextResponse.json(ol);
    // Inventaire's cover is for this exact edition, so it goes with OpenLibrary's ISBN matches.
    const at = ol.filter((c) => c.label.startsWith("Your edition")).length;
    return NextResponse.json([...ol.slice(0, at), { url, thumb: url, label: "Your edition (Inventaire)" }, ...ol.slice(at)].slice(0, 12));
  } catch {
    return NextResponse.json({ error: "OpenLibrary didn't respond. Try again in a moment." }, { status: 502 });
  }
}
