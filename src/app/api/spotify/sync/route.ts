import { revalidatePath } from "next/cache";
import { SpotifyError, syncSpotify } from "@/lib/spotify";

/** Pulls listening progress for linked audiobooks. Called when the app opens (throttled) and by "Sync now". */
export async function POST(req: Request) {
  const { force } = ((await req.json().catch(() => ({}))) ?? {}) as { force?: boolean };
  try {
    const result = await syncSpotify(!!force);
    if (result.changed.length) revalidatePath("/", "layout");
    return Response.json(result);
  } catch (err) {
    const status = err instanceof SpotifyError ? err.status : 500;
    return Response.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: status === 401 || status === 400 ? 409 : 502 });
  }
}
