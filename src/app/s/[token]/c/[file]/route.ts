import { readCover } from "@/lib/covers";
import { withShareLibrary } from "@/lib/owners";
import { coverIsShared } from "@/lib/share";

// Covers for a public share page. Only serves covers of books on that list.
export async function GET(_req: Request, ctx: RouteContext<"/s/[token]/c/[file]">) {
  const { token, file } = await ctx.params;
  if (!/^[\w-]+\.webp$/.test(file)) return new Response("Not found", { status: 404 });
  const body = await withShareLibrary(token, async () => ((await coverIsShared(token, file)) ? readCover(file) : null));
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400" } });
}
