"use server";

import { revalidatePath } from "next/cache";
import { notInDemo } from "@/lib/demo";
import { addAudiobook, disconnectSpotify, ignoreAudiobook, linkAudiobook, restoreAudiobook, syncSpotify, unlinkAudiobook } from "@/lib/spotify";

const done = () => revalidatePath("/", "layout");

export async function linkAction(fd: FormData) {
  notInDemo();
  const bookId = Number(fd.get("book_id"));
  const audiobookId = String(fd.get("audiobook_id") ?? "");
  if (!bookId || !/^\w{10,40}$/.test(audiobookId)) return;
  await linkAudiobook(bookId, audiobookId, String(fd.get("name") ?? ""));
  await syncSpotify(true).catch(() => {}); // show its progress straight away
  done();
}

/** "Add to BookBox": bring an audiobook in now, creating its book if there isn't one. */
export async function addAction(fd: FormData) {
  notInDemo();
  const audiobookId = String(fd.get("audiobook_id") ?? "");
  if (!/^\w{10,40}$/.test(audiobookId)) return;
  await addAudiobook(audiobookId);
  await syncSpotify(true).catch(() => {}); // show its progress straight away
  done();
}

export async function unlinkAction(fd: FormData) {
  notInDemo();
  await unlinkAudiobook(Number(fd.get("book_id")));
  done();
}

export async function ignoreAction(fd: FormData) {
  notInDemo();
  await ignoreAudiobook(String(fd.get("audiobook_id") ?? ""));
  done();
}

export async function restoreAction(fd: FormData) {
  notInDemo();
  await restoreAudiobook(String(fd.get("audiobook_id") ?? ""));
  done();
}

export async function syncNowAction() {
  notInDemo();
  await syncSpotify(true).catch(() => {});
  done();
}

export async function disconnectAction() {
  notInDemo();
  await disconnectSpotify();
  done();
}
