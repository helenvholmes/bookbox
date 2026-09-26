"use server";

import { revalidatePath } from "next/cache";
import { detectSeriesFromTitles, renameSeries, setBookSeries } from "@/lib/books";
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
