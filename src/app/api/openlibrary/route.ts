import { NextResponse, type NextRequest } from "next/server";
import { getOpenLibraryDetails, searchOpenLibrary } from "@/lib/openlibrary";

// GET ?q=...                 search by title, author or ISBN
// GET ?work=OL..W&edition=OL..M   full details for one result
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const work = sp.get("work");
    if (work) {
      const details = await getOpenLibraryDetails(work, sp.get("edition"));
      return details ? NextResponse.json(details) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(await searchOpenLibrary(sp.get("q") ?? ""));
  } catch {
    return NextResponse.json({ error: "OpenLibrary didn't respond. Try again in a moment." }, { status: 502 });
  }
}
