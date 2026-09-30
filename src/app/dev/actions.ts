"use server";

import { revalidatePath } from "next/cache";

export type PullState = { error?: string; summary?: string } | null;

/** "Pull latest" in local development: refreshes this computer's copy from the hosted library. */
export async function pullLatestAction(): Promise<PullState> {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL) return { error: "Only available when running BookBox on your own computer." };
  const { pullFromCloud } = await import("@/lib/pull-cloud");
  try {
    const r = await pullFromCloud();
    revalidatePath("/", "layout");
    return { summary: `Updated: ${r.tables.books ?? 0} books${r.coversDownloaded ? `, ${r.coversDownloaded} new covers` : ""}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn’t pull the library." };
  }
}
