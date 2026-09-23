"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteTag, mergeTag, renameTag } from "@/lib/books";

export async function updateTagAction(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return;
  try {
    renameTag(Number(fd.get("id")), name, String(fd.get("notes") ?? "").trim());
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
  mergeTag(from, into);
  revalidatePath("/", "layout");
  redirect(`/tags/${into}`);
}

export async function deleteTagAction(fd: FormData) {
  deleteTag(Number(fd.get("id")));
  revalidatePath("/", "layout");
  redirect("/tags");
}
