"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createPerson, deletePerson, updatePerson } from "@/lib/books";

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const relationships = (fd: FormData) => fd.getAll("relationship").map(String).join(",");

export async function createPersonAction(fd: FormData) {
  const first = text(fd, "first");
  if (!first) return;
  const { slug } = await createPerson(first, text(fd, "last"), relationships(fd));
  revalidatePath("/", "layout");
  redirect(`/people/${slug}`);
}

/** `slug` is the person's (possibly new) URL slug after a save. */
export type UpdatePersonState = { savedAt?: number; slug?: string; error?: string } | null;

export async function updatePersonAction(_prev: UpdatePersonState, fd: FormData): Promise<UpdatePersonState> {
  const id = Number(fd.get("id"));
  const first = text(fd, "first");
  if (!first) return { error: "A first name is required." };
  const slug = await updatePerson(id, first, text(fd, "last"), relationships(fd));
  revalidatePath("/", "layout");
  return { savedAt: Date.now(), slug };
}

export async function deletePersonAction(fd: FormData) {
  await deletePerson(Number(fd.get("id")));
  revalidatePath("/", "layout");
  redirect("/people");
}

export type ShareState = { savedAt?: number; token?: string; error?: string } | null;

export async function saveShareAction(_prev: ShareState, fd: FormData): Promise<ShareState> {
  const { ACCENTS, saveShareSettings } = await import("@/lib/share");
  const personId = Number(fd.get("person_id"));
  const accent = String(fd.get("accent") ?? "");
  const token = await saveShareSettings(personId, {
    enabled: fd.get("enabled") === "on",
    list: fd.get("list") === "by" ? "by" : "for",
    title: text(fd, "title"),
    message: text(fd, "message"),
    layout: fd.get("layout") === "list" ? "list" : "grid",
    show_ratings: fd.get("show_ratings") === "on",
    show_reviews: fd.get("show_reviews") === "on",
    accent: (ACCENTS as readonly string[]).includes(accent) ? accent : ACCENTS[0],
  });
  revalidatePath("/people", "layout");
  return { savedAt: Date.now(), token };
}

export async function regenerateShareAction(fd: FormData) {
  const { regenerateShareToken } = await import("@/lib/share");
  const personId = Number(fd.get("person_id"));
  await regenerateShareToken(personId);
  revalidatePath("/people", "layout");
}
