import { NextResponse, type NextRequest } from "next/server";
import { lookupDetails, searchCatalogs, searchOtherCatalogs } from "@/lib/catalogs";
import { toIsbn13 } from "@/lib/names";

// GET ?q=...                 search by title, author or ISBN (OpenLibrary, or the other catalogs when it has nothing)
// GET ?q=...&more=1          search only the Library of Congress and Inventaire
// GET ?work=OL..W&edition=OL..M&isbn=…&author=…   full details for one OpenLibrary result, gaps filled from the other catalogs
//
// Answers are kept by the browser for ten minutes (and by the server for longer; see catalogs.ts), but a
// search OpenLibrary didn't answer (it may have been down) for only a minute.
const keep = (seconds: number) => ({ headers: { "Cache-Control": `private, max-age=${seconds}` } });

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const work = sp.get("work");
    if (work) {
      const details = await lookupDetails(work, sp.get("edition"), toIsbn13(sp.get("isbn")), sp.getAll("author").filter(Boolean));
      if (!details) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(details, keep(600));
    }
    const q = sp.get("q") ?? "";
    if (sp.get("more")) return NextResponse.json(await searchOtherCatalogs(q), keep(600));
    const results = await searchCatalogs(q);
    return NextResponse.json(results, keep(results.some((r) => r.source === "openlibrary") ? 600 : 60));
  } catch {
    return NextResponse.json({ error: "OpenLibrary didn't respond. Try again in a moment." }, { status: 502 });
  }
}
