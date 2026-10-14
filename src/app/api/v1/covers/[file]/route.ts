import { apiError, apiRoute, preflight } from "@/lib/api";
import { readCover } from "@/lib/covers";

/** Covers for apps, signed in with an API key (/covers/<file> needs the session cookie). */
export const GET = apiRoute(async (_request, ctx: RouteContext<"/api/v1/covers/[file]">) => {
  const { file } = await ctx.params;
  const body = /^[\w-]+\.webp$/.test(file) ? await readCover(file) : null;
  if (!body) return apiError(404, "not_found", "There’s no cover with that name.");
  return new Response(body, {
    headers: {
      "Content-Type": "image/webp",
      // Filenames contain a content hash, so they never change.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});
export const OPTIONS = preflight;
