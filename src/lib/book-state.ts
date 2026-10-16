"use client";

import type { Read } from "./books";
import { todayLocal } from "./dates";
import { newId, submit } from "./outbox";
import { STATUSES, type SyncOp, type TextField } from "./sync-ops";

/**
 * What the book page shows: what the server sent, with edits still waiting in the outbox laid
 * on top, in order. Once they sync, the server's copy already has them and the outbox is empty.
 */

export const statusesFrom = (shelves: string[]) => shelves.filter((s) => (STATUSES as readonly string[]).includes(s));

export function withStatus(statuses: string[], ops: SyncOp[]): string[] {
  for (const op of ops) if (op.kind === "status") statuses = op.shelf ? [op.shelf] : [];
  return statuses;
}

export function withRating(rating: number | null, ops: SyncOp[]): number | null {
  for (const op of ops) if (op.kind === "rating") rating = op.rating;
  return rating;
}

export function withText(field: TextField, value: string, ops: SyncOp[]): string {
  for (const op of ops) if (op.kind === "text" && op.field === field) value = op.value;
  return value;
}

/** A read as shown: `id` is null until a read added offline reaches the server. */
export type ShownRead = Omit<Read, "id"> & { id: number | null; pending: boolean };

const isRead = (r: ShownRead, ref: { readId: number | null; clientId: string | null }) => (ref.readId !== null ? r.id === ref.readId : r.clientId === ref.clientId);

export function withReads(reads: Read[], ops: SyncOp[]): ShownRead[] {
  let shown: ShownRead[] = reads.map((r) => ({ ...r, pending: false }));
  for (const op of ops) {
    if (op.kind === "addRead" && !shown.some((r) => r.clientId === op.clientId)) {
      shown.push({ id: null, clientId: op.clientId, year: op.year, note: op.note, startedOn: op.startedOn ?? null, finishedOn: op.finishedOn ?? null, pending: true });
    } else if (op.kind === "deleteRead") {
      shown = shown.filter((r) => !isRead(r, op));
    } else if (op.kind === "readDates") {
      shown = shown.map((r) =>
        isRead(r, op) ? { ...r, startedOn: op.startedOn, finishedOn: op.finishedOn, year: op.finishedOn ? Number(op.finishedOn.slice(0, 4)) : r.year, pending: true } : r,
      );
    }
  }
  // Newest year first; within a year, newest first (reads not synced yet have no id, so they count as newest).
  const order = (r: ShownRead) => r.id ?? Number.MAX_SAFE_INTEGER;
  return shown.sort((a, b) => b.year - a.year || (b.finishedOn ?? "").localeCompare(a.finishedOn ?? "") || order(b) - order(a));
}

/** When the read in progress began, as the server would have it once the queued edits land (see setStatus). */
export function withStartedOn(saved: string | null, ops: SyncOp[]): string | null {
  let day = saved;
  for (const op of ops) {
    if (op.kind === "status") {
      if (op.shelf === "Currently Reading" && op.date) day ??= op.date;
      else if (!op.shelf || op.shelf === "To Read") day = null;
    } else if (op.kind === "addRead" && op.finishedOn) day = null;
    else if (op.kind === "startedOn") day = op.date;
  }
  return day;
}

export type ShownProgress = { percent: number; page: number | null; source: "manual" | "spotify"; pending: boolean } | null;

export function withProgress(saved: ShownProgress, ops: SyncOp[]): ShownProgress {
  let p = saved;
  for (const op of ops) if (op.kind === "progress") p = op.percent === null ? null : { percent: op.percent, page: op.page, source: "manual", pending: true };
  return p;
}

/**
 * Moves a book to a status shelf (or none), dated with the device's day. Finishing a book you were
 * reading logs the read with its days: a read already logged this year without a finish day gets
 * them, and one that's already finished is left alone.
 */
export function changeStatus(bookId: number, shelf: (typeof STATUSES)[number] | null, finishing?: { reads: ShownRead[]; startedOn: string | null }) {
  const today = todayLocal();
  submit({ kind: "status", bookId, shelf, date: today });
  if (shelf !== "Read" || !finishing) return;
  const year = Number(today.slice(0, 4));
  const logged = finishing.reads.find((r) => r.year === year);
  if (!logged) submit({ kind: "addRead", bookId, clientId: newId(), year, note: "", startedOn: finishing.startedOn, finishedOn: today });
  else if (!logged.finishedOn) {
    submit({ kind: "readDates", bookId, readId: logged.id, clientId: logged.id === null ? logged.clientId : null, startedOn: logged.startedOn ?? finishing.startedOn, finishedOn: today });
    submit({ kind: "startedOn", bookId, date: null });
  } else submit({ kind: "startedOn", bookId, date: null });
}
