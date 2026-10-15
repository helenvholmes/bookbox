"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { createList, deleteList, listFromTag, renameList, setOnList } from "@/lib/books";

const cleanName = (v: FormDataEntryValue | null) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 80);

export type ListState = { error?: string; doneAt?: number } | null;

export async function createListAction(_prev: ListState, fd: FormData): Promise<ListState> {
  const name = cleanName(fd.get("name"));
  if (!name) return { error: "Give the list a name." };
  if ((await createList(name)) === null) return { error: `There’s already a list or shelf called “${name}”.` };
  revalidatePath("/", "layout");
  return { doneAt: Date.now() };
}

export async function renameListAction(_prev: ListState, fd: FormData): Promise<ListState> {
  const name = cleanName(fd.get("name"));
  if (!name) return { error: "Give the list a name." };
  if (!(await renameList(Number(fd.get("id")), name))) return { error: `There’s already a list or shelf called “${name}”.` };
  revalidatePath("/", "layout");
  return { doneAt: Date.now() };
}

export async function deleteListAction(fd: FormData) {
  await deleteList(Number(fd.get("id")));
  revalidatePath("/", "layout");
  redirect("/lists", RedirectType.replace);
}

/** Turns a tag (like an imported Goodreads shelf) into a list. */
export async function listFromTagAction(fd: FormData) {
  const id = await listFromTag(Number(fd.get("tag")));
  revalidatePath("/", "layout");
  if (id) redirect(`/lists/${id}`, RedirectType.push);
}

/** Adds a book to a list or takes it off, from the book's page. */
export async function setOnListAction(bookId: number, listId: number, on: boolean) {
  if (!Number.isInteger(bookId) || !Number.isInteger(listId)) return;
  await setOnList(bookId, listId, !!on);
  revalidatePath("/", "layout");
}
