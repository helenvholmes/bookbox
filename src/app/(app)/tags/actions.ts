"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTag, deleteTag, mergeTag, renameTag } from "@/lib/books";

export async function updateTagAction(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return;
  try {
    await renameTag(Number(fd.get("id")), name, String(fd.get("notes") ?? "").trim());
  } catch {
    // Another tag already has this name; merging is the way to combine them.
    return;
  }
  revalidatePath("/", "layout");
}

export async function mergeTagAction(fd: FormData) {
  const from = Number(fd.get("id"));
  const into = Number(fd.get("into"));
  if (!into || into === from) return;
  await mergeTag(from, into);
  revalidatePath("/", "layout");
  redirect(`/tags/${into}`);
}

export async function deleteTagAction(fd: FormData) {
  await deleteTag(Number(fd.get("id")));
  revalidatePath("/", "layout");
  redirect("/tags");
}

export type CreateTagState = { error?: string; createdAt?: number } | null;

export async function createTagAction(_prev: CreateTagState, fd: FormData): Promise<CreateTagState> {
  const name = String(fd.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { error: "Give the tag a name." };
  if (await createTag(name) === null) return { error: `There's already a tag called “${name}”.` };
  revalidatePath("/", "layout");
  return { createdAt: Date.now() };
}
