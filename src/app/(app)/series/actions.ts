"use server";

import { revalidatePath } from "next/cache";
import { detectSeriesFromTitles, getSeries, renameSeries, setBookSeries } from "@/lib/books";
import { transaction } from "@/lib/db";

/** Files every book whose title names its series ("… (Shades of Magic, #3)") into that series. */
export async function applyDetectedSeriesAction() {
  const found = await detectSeriesFromTitles();
  await transaction(async () => {
    for (const f of found) await setBookSeries(f.bookId, f.name, f.position);
  });
  revalidatePath("/", "layout");
}

export async function renameSeriesAction(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return;
  try {
    await renameSeries(Number(fd.get("id")), name);
  } catch {
    return; // another series already has that name
  }
  revalidatePath("/", "layout");
}

export type AddSeriesBookState = { error?: string; bookId?: number } | null;

/** Adds a book from the series on Hardcover to To Read. The book is looked up again here rather than trusted from the page. */
export async function addSeriesBookAction(seriesId: number, hardcoverUrl: string): Promise<AddSeriesBookState> {
  const { addSeriesBook, hardcoverSeries, HardcoverError } = await import("@/lib/hardcover");
  const data = await getSeries(seriesId);
  if (!data) return { error: "That series is gone." };
  try {
    const found = await hardcoverSeries(data.series.name, data.books.map((b) => b.author));
    const entry = found?.books.find((b) => b.url === hardcoverUrl);
    if (!entry) return { error: "Hardcover doesn’t list that book in this series any more." };
    const bookId = await addSeriesBook(data.series.name, entry);
    revalidatePath("/", "layout");
    return { bookId };
  } catch (e) {
    return { error: e instanceof HardcoverError ? e.message : "Couldn’t add it just now. Try again in a minute." };
  }
}
