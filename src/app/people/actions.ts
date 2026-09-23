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

export async function updatePersonAction(fd: FormData) {
  const id = Number(fd.get("id"));
  const first = text(fd, "first");
  if (!first) return;
  updatePerson(id, first, text(fd, "last"), relationships(fd));
  revalidatePath("/", "layout");
}

export async function deletePersonAction(fd: FormData) {
  deletePerson(Number(fd.get("id")));
  revalidatePath("/", "layout");
  redirect("/people");
}
