"use server";

import { revalidatePath } from "next/cache";
import { GENDERS, lookUpNextAuthors, setAuthorGender, type Gender } from "@/lib/author-genders";

/** Looks up the next batch of authors on Wikidata (see src/lib/author-genders.ts). */
export async function lookUpAuthorsAction(): Promise<{ remaining: number; error?: string }> {
  try {
    const { remaining } = await lookUpNextAuthors();
    return { remaining };
  } catch {
    return { remaining: 0, error: "Couldn’t reach Wikidata. Try again later." };
  }
}

export async function setAuthorGenderAction(name: string, gender: string) {
  const clean = name.trim().slice(0, 500);
  if (!clean) return;
  await setAuthorGender(clean, (GENDERS as readonly string[]).includes(gender) ? (gender as Gender) : null);
  revalidatePath("/", "layout");
}

/** Revalidates once a run of lookups is done, so Stats shows the new counts. */
export async function finishLookupAction() {
  revalidatePath("/", "layout");
}
