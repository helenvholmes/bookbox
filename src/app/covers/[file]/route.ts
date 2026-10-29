import { readCover } from "@/lib/covers";
import { demoMode } from "@/lib/demo";

export async function GET(req: Request, ctx: RouteContext<"/covers/[file]">) {
  const { file } = await ctx.params;
  if (!/^[\w-]+\.webp$/.test(file)) return new Response("Not found", { status: 404 });
  const body = await readCover(file);
  // A demo library's covers that aren't its own are the snapshot's, served as plain files.
  if (!body && demoMode()) return Response.redirect(new URL(`/demo-covers/${file}`, req.url), 307);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": "image/webp",
      // Filenames contain a content hash, so they never change.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
