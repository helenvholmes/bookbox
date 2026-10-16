"use server";

import { revalidatePath } from "next/cache";
import { acceptSuggestion, dismissSuggestion, listSuggestions, refreshBatch, resetRefresh, type BatchResult } from "@/lib/refresh";

export async function refreshBatchAction(cursor: number | null, recheck: boolean): Promise<BatchResult> {
  if (recheck && cursor === null) await resetRefresh();
  return refreshBatch(cursor);
}

export async function suggestionAction(fd: FormData) {
  const bookId = Number(fd.get("book_id"));
  const field = String(fd.get("field"));
  if (fd.get("decision") === "accept") await acceptSuggestion(bookId, field);
  else await dismissSuggestion(bookId, field);
  revalidatePath("/", "layout");
}

/** Accept or dismiss every suggestion of one kind (title, author or series). */
export async function allSuggestionsAction(fd: FormData) {
  const field = String(fd.get("field"));
  const accept = fd.get("decision") === "accept";
  for (const s of (await listSuggestions()).filter((s) => s.field === field)) {
    if (accept) await acceptSuggestion(s.book_id, s.field);
    else await dismissSuggestion(s.book_id, s.field);
  }
  revalidatePath("/", "layout");
}
