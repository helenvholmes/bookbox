"use server";

import { revalidatePath } from "next/cache";
import { disconnectSpotify, ignoreAudiobook, linkAudiobook, syncSpotify, unlinkAudiobook } from "@/lib/spotify";

const done = () => revalidatePath("/", "layout");

export async function linkAction(fd: FormData) {
  const bookId = Number(fd.get("book_id"));
  const audiobookId = String(fd.get("audiobook_id") ?? "");
  if (!bookId || !/^\w{10,40}$/.test(audiobookId)) return;
  await linkAudiobook(bookId, audiobookId, String(fd.get("name") ?? ""));
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

export async function syncNowAction() {
  await syncSpotify(true).catch(() => {});
  done();
}

export async function disconnectAction() {
  await disconnectSpotify();
  done();
}
