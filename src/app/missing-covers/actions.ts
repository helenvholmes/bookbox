"use server";

import { revalidatePath } from "next/cache";
import { getCoverName, setCover, skipCover } from "@/lib/books";
import { deleteCover, fetchCover, isUsableImage, saveCover } from "@/lib/covers";

export async function applyCoverAction(bookId: number, url: string): Promise<{ error?: string }> {
  const data = await fetchCover(url);
  if (!data || !(await isUsableImage(data))) return { error: "That cover couldn't be downloaded. Try another one." };
  const name = await saveCover(bookId, data);
  if (!name) return { error: "That cover couldn't be used." };
  const previous = getCoverName(bookId);
  setCover(bookId, name);
  if (previous && previous !== name) deleteCover(previous);
  revalidatePath("/", "layout");
  return {};
}

export async function skipCoverAction(bookId: number) {
  skipCover(bookId);
  revalidatePath("/", "layout");
}
