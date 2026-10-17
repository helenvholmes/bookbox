import { NextResponse, type NextRequest } from "next/server";
import { searchCatalogs, searchOtherCatalogs, withOtherCatalogs } from "@/lib/catalogs";
import { toIsbn13 } from "@/lib/names";
import { getOpenLibraryDetails } from "@/lib/openlibrary";

// GET ?q=...                 search by title, author or ISBN (OpenLibrary, or the other catalogs when it has nothing)
// GET ?q=...&more=1          search only the Library of Congress and Inventaire
// GET ?work=OL..W&edition=OL..M&isbn=…   full details for one OpenLibrary result, gaps filled from the other catalogs
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const work = sp.get("work");
    if (work) {
      const details = await getOpenLibraryDetails(work, sp.get("edition"));
      if (!details) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(await withOtherCatalogs({ ...details, isbn13: details.isbn13 ?? toIsbn13(sp.get("isbn")) }));
    }
    const q = sp.get("q") ?? "";
    return NextResponse.json(sp.get("more") ? await searchOtherCatalogs(q) : await searchCatalogs(q));
  } catch {
    return NextResponse.json({ error: "OpenLibrary didn't respond. Try again in a moment." }, { status: 502 });
  }
}
