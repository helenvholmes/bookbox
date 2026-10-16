"use server";

import { revalidatePath } from "next/cache";
import { getCoverName, setCover, skipCover } from "@/lib/books";
import { coverLimitReached, coverUploadsPaused, MAX_COVERS, deleteCover, fetchCover, isUsableImage, saveCover } from "@/lib/covers";

const PAUSED = "New covers are paused until the next billing period, to stay within the free storage tier. See Settings.";

export async function applyCoverAction(bookId: number, url: string): Promise<{ error?: string }> {
  if (await coverUploadsPaused()) return { error: PAUSED };
  if (await coverLimitReached()) return { error: `Your library has ${MAX_COVERS.toLocaleString("en-US")} covers, as many as it can keep.` };
  const data = await fetchCover(url);
  if (!data || !(await isUsableImage(data))) return { error: "That cover couldn't be downloaded. Try another one." };
  const name = await saveCover(bookId, data);
  if (!name) return { error: "That cover couldn't be used." };
  const previous = await getCoverName(bookId);
  await setCover(bookId, name);
  if (previous && previous !== name) await deleteCover(previous);
  revalidatePath("/", "layout");
  return {};
}

export async function skipCoverAction(bookId: number) {
  await skipCover(bookId);
  revalidatePath("/", "layout");
}
