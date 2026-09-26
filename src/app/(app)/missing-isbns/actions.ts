"use server";

import { revalidatePath } from "next/cache";
import { findBookByIsbn, setIsbn, skipIsbn } from "@/lib/books";
import { toIsbn13 } from "@/lib/names";

export async function saveIsbnAction(bookId: number, raw: string, work: string | null, edition: string | null): Promise<{ error?: string }> {
  const isbn = toIsbn13(raw);
  if (!isbn) return { error: `“${raw}” isn't a valid ISBN.` };
  const other = await findBookByIsbn(isbn);
  if (other && other.id !== bookId) return { error: `That ISBN is already on “${other.title}”.` };
  await setIsbn(bookId, isbn, work, edition);
  revalidatePath("/", "layout");
  return {};
}

export async function skipIsbnAction(bookId: number) {
  await skipIsbn(bookId);
  revalidatePath("/", "layout");
}
