"use server";

import { revalidatePath } from "next/cache";
import { markNotDuplicates } from "@/lib/duplicates";

export async function notDuplicatesAction(fd: FormData) {
  const ids = fd.getAll("id").map(Number).filter(Boolean);
  if (ids.length > 1) markNotDuplicates(ids);
  revalidatePath("/", "layout");
}
