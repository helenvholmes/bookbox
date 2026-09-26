import { readCover } from "@/lib/covers";

export async function GET(_req: Request, ctx: RouteContext<"/covers/[file]">) {
  const { file } = await ctx.params;
  if (!/^[\w-]+\.webp$/.test(file)) return new Response("Not found", { status: 404 });
  const body = await readCover(file);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": "image/webp",
      // Filenames contain a content hash, so they never change.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
