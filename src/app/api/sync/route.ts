import { revalidatePath } from "next/cache";
import { addRead, deleteRead, setManualProgress, setRating, setStatus, setText } from "@/lib/books";
import { db } from "@/lib/db";
import { isValidOp, type SyncResult } from "@/lib/sync-ops";

/**
 * Applies edits queued on a device (see src/lib/outbox.ts), in order. A route rather than a
 * server action so pages saved for offline use keep working after a new deploy. Signed-in only:
 * the proxy answers 401 without a session.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { ops?: unknown } | null;
  if (!body || !Array.isArray(body.ops) || body.ops.length > 500) return Response.json({ error: "Expected { ops: [...] }" }, { status: 400 });

  const result: SyncResult = { applied: [], rejected: [] };
  const exists = new Map<number, boolean>();
  for (const op of body.ops) {
    if (!isValidOp(op)) {
      const id = (op as { opId?: unknown })?.opId;
      if (typeof id === "string") result.rejected.push(id);
      continue;
    }
    // A book deleted since the edit was made: nothing to apply, so it's done.
    if (!exists.has(op.bookId)) exists.set(op.bookId, !!(await db.prepare("SELECT 1 FROM books WHERE id = ?").get(op.bookId)));
    if (exists.get(op.bookId)) {
      if (op.kind === "status") await setStatus(op.bookId, op.shelf);
      else if (op.kind === "rating") await setRating(op.bookId, op.rating);
      else if (op.kind === "text") await setText(op.bookId, op.field, op.value);
      else if (op.kind === "addRead") await addRead(op.bookId, op.year, op.note, op.clientId);
      else if (op.kind === "progress") await setManualProgress(op.bookId, op.percent, op.page);
      else if (op.kind === "deleteRead") await deleteRead(op.readId !== null ? { id: op.readId } : { clientId: op.clientId! });
    }
    result.applied.push(op.opId);
  }
  if (result.applied.length) revalidatePath("/", "layout");
  return Response.json(result);
}
