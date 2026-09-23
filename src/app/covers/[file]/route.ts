import fs from "node:fs/promises";
import path from "node:path";
import { COVERS_DIR } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/covers/[file]">) {
  const { file } = await ctx.params;
  if (!/^[\w-]+\.webp$/.test(file)) return new Response("Not found", { status: 404 });
  try {
    const data = await fs.readFile(path.join(COVERS_DIR, file));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/webp",
        // Filenames contain a content hash, so they never change.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
