"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteBook, getCoverName, saveBook, setCover, STATUS, toggleStatus, type BookInput } from "@/lib/books";
import { deleteCover, fetchCover, isUsableImage, saveCover } from "@/lib/covers";
import { toIsbn13 } from "@/lib/names";

export type SaveState = { error?: string } | undefined;

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const int = (fd: FormData, k: string) => {
  const n = parseInt(text(fd, k), 10);
  return Number.isFinite(n) ? n : null;
};
const many = (fd: FormData, k: string) => fd.getAll(k).map((v) => String(v).trim()).filter(Boolean);

function parseBook(fd: FormData): BookInput | string {
  const title = text(fd, "title");
  if (!title) return "A title is required.";
  const rawIsbn = text(fd, "isbn13");
  const isbn13 = rawIsbn ? toIsbn13(rawIsbn) : null;
  if (rawIsbn && !isbn13) return `“${rawIsbn}” isn't a valid ISBN.`;
  const rating = int(fd, "rating");

  return {
    title,
    author: text(fd, "author").replace(/\s+/g, " "),
    additional_authors: text(fd, "additional_authors"),
    isbn13,
    rating: rating && rating >= 1 && rating <= 5 ? rating : null,
    description: text(fd, "description"),
    review: text(fd, "review"),
    spoiler: text(fd, "spoiler"),
    quotes: text(fd, "quotes"),
    private_notes: text(fd, "private_notes"),
    on_kindle: fd.get("on_kindle") === "on",
    owned: fd.get("owned") === "on",
    publisher: text(fd, "publisher"),
    publish_year: int(fd, "publish_year"),
    pages: int(fd, "pages"),
    ol_work: text(fd, "ol_work") || null,
    ol_edition: text(fd, "ol_edition") || null,
    years: [...new Set(many(fd, "years").map(Number).filter((y) => y > 1900 && y < 2200))],
    shelves: many(fd, "shelves"),
    tags: many(fd, "tags"),
    recommendedFor: many(fd, "recommended_for"),
    recommendedBy: many(fd, "recommended_by"),
  };
}

type CoverChange = { set: Buffer } | { remove: true } | null;

/** Reads the requested cover change up front so a bad image fails before anything is saved. */
async function readCoverChange(fd: FormData): Promise<CoverChange | string> {
  const file = fd.get("cover_file");
  const url = text(fd, "cover_url");
  if (file instanceof File && file.size > 0) {
    if (file.size > 9.5 * 1024 * 1024) return "That image is too big (10 MB max).";
    const data = Buffer.from(await file.arrayBuffer());
    return (await isUsableImage(data)) ? { set: data } : "That image couldn't be used as a cover.";
  }
  if (url) {
    const data = await fetchCover(url);
    // A missing OpenLibrary cover isn't worth failing the save over.
    return data && (await isUsableImage(data)) ? { set: data } : null;
  }
  return fd.get("cover_remove") === "1" ? { remove: true } : null;
}

async function applyCover(bookId: number, change: CoverChange) {
  if (!change) return;
  const previous = getCoverName(bookId);
  const next = "set" in change ? await saveCover(bookId, change.set) : null;
  if ("set" in change && !next) return;
  if (next === previous) return;
  setCover(bookId, next);
  deleteCover(previous);
}

export async function saveBookAction(_prev: SaveState, fd: FormData): Promise<SaveState> {
  const parsed = parseBook(fd);
  if (typeof parsed === "string") return { error: parsed };
  const idField = text(fd, "id");
  const id = idField ? Number(idField) : null;

  const cover = await readCoverChange(fd);
  if (typeof cover === "string") return { error: cover };

  let bookId: number;
  try {
    bookId = saveBook(id, parsed);
  } catch (err) {
    return { error: (err as Error).message || "Couldn't save the book." };
  }
  await applyCover(bookId, cover);

  revalidatePath("/", "layout");
  redirect(`/books/${bookId}`);
}

export async function deleteBookAction(fd: FormData) {
  const id = Number(fd.get("id"));
  const cover = getCoverName(id);
  deleteBook(id);
  deleteCover(cover);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function setStatusAction(fd: FormData) {
  const id = Number(fd.get("id"));
  const shelf = String(fd.get("shelf") ?? "");
  if (!id || !STATUS.includes(shelf)) return;
  toggleStatus(id, shelf);
  revalidatePath("/", "layout");
}
