import { type NextRequest } from "next/server";
import sharp from "sharp";
import { fetchCover, isUsableImage } from "@/lib/covers";
import { inventaireByIsbn } from "@/lib/inventaire";
import { toIsbn13 } from "@/lib/names";

// GET ?isbn=…  Inventaire's cover for that edition (404 when it has none). For when OpenLibrary's
// cover server is down and search results and the book form need a cover from elsewhere.
export async function GET(req: NextRequest) {
  const isbn = toIsbn13(req.nextUrl.searchParams.get("isbn"));
  const url = isbn ? (await inventaireByIsbn(isbn).catch(() => null))?.coverUrl : null;
  const data = url ? await fetchCover(url) : null;
  if (!data || !(await isUsableImage(data))) return new Response(null, { status: 404 });
  const { format } = await sharp(data).metadata();
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": `image/${format}`, "Cache-Control": "private, max-age=86400" },
  });
}
