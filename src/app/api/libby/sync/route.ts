import { revalidatePath } from "next/cache";
import { cleanTimeZone, LibbyError, syncLibby } from "@/lib/libby-sync";

/** Pulls your Libby loans and holds. Called when the app opens (throttled). */
export async function POST(req: Request) {
  const { force, timeZone } = ((await req.json().catch(() => ({}))) ?? {}) as { force?: boolean; timeZone?: unknown };
  try {
    // The device's time zone, so books are borrowed, due and finished on your calendar rather than the server's.
    const result = await syncLibby({ force: !!force, timeZone: cleanTimeZone(timeZone) });
    if (result.changed.length) revalidatePath("/", "layout");
    return Response.json(result);
  } catch (err) {
    const signedOut = err instanceof LibbyError && err.signedOut;
    return Response.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: signedOut ? 409 : 502 });
  }
}
