"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createPerson, deletePerson, updatePerson } from "@/lib/books";

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const relationships = (fd: FormData) => fd.getAll("relationship").map(String).join(",");

export async function createPersonAction(fd: FormData) {
  const first = text(fd, "first");
  if (!first) return;
  const id = createPerson(first, text(fd, "last"), relationships(fd));
  revalidatePath("/", "layout");
  redirect(`/people/${id}`);
}

export type UpdatePersonState = { savedAt?: number; error?: string } | null;

export async function updatePersonAction(_prev: UpdatePersonState, fd: FormData): Promise<UpdatePersonState> {
  const id = Number(fd.get("id"));
  const first = text(fd, "first");
  if (!first) return { error: "A first name is required." };
  updatePerson(id, first, text(fd, "last"), relationships(fd));
  revalidatePath("/", "layout");
  return { savedAt: Date.now() };
}

export async function deletePersonAction(fd: FormData) {
  deletePerson(Number(fd.get("id")));
  revalidatePath("/", "layout");
  redirect("/people");
}
