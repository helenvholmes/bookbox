"use server";

import { revalidatePath } from "next/cache";
import { addAudiobook, disconnectSpotify, ignoreAudiobook, linkAudiobook, restoreAudiobook, syncSpotify, unlinkAudiobook } from "@/lib/spotify";

const done = () => revalidatePath("/", "layout");

export async function linkAction(fd: FormData) {
  const bookId = Number(fd.get("book_id"));
  const audiobookId = String(fd.get("audiobook_id") ?? "");
  if (!bookId || !/^\w{10,40}$/.test(audiobookId)) return;
  await linkAudiobook(bookId, audiobookId, String(fd.get("name") ?? ""));
  await syncSpotify(true).catch(() => {}); // show its progress straight away
  done();
}

/** "Add to BookBox": bring an audiobook in now, creating its book if there isn't one. */
export async function addAction(fd: FormData) {
  const audiobookId = String(fd.get("audiobook_id") ?? "");
  if (!/^\w{10,40}$/.test(audiobookId)) return;
  await addAudiobook(audiobookId);
  await syncSpotify(true).catch(() => {}); // show its progress straight away
  done();
}

export async function unlinkAction(fd: FormData) {
  await unlinkAudiobook(Number(fd.get("book_id")));
  done();
}

export async function ignoreAction(fd: FormData) {
  await ignoreAudiobook(String(fd.get("audiobook_id") ?? ""));
  done();
}

export async function restoreAction(fd: FormData) {
  await restoreAudiobook(String(fd.get("audiobook_id") ?? ""));
  done();
}

export async function syncNowAction() {
  await syncSpotify(true).catch(() => {});
  done();
}

export async function disconnectAction() {
  await disconnectSpotify();
  done();
}
