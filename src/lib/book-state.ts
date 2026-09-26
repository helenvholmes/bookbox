"use client";

import type { Read } from "./books";
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
export type ShownRead = { id: number | null; clientId: string | null; year: number; note: string; pending: boolean };

export function withReads(reads: Read[], ops: SyncOp[]): ShownRead[] {
  let shown: ShownRead[] = reads.map((r) => ({ ...r, pending: false }));
  for (const op of ops) {
    if (op.kind === "addRead" && !shown.some((r) => r.clientId === op.clientId)) {
      shown.push({ id: null, clientId: op.clientId, year: op.year, note: op.note, pending: true });
    } else if (op.kind === "deleteRead") {
      shown = shown.filter((r) => (op.readId !== null ? r.id !== op.readId : r.clientId !== op.clientId));
    }
  }
  // Newest year first; within a year, newest first (reads not synced yet have no id, so they count as newest).
  const order = (r: ShownRead) => r.id ?? Number.MAX_SAFE_INTEGER;
  return shown.sort((a, b) => b.year - a.year || order(b) - order(a));
}

export type ShownProgress = { percent: number; page: number | null; source: "manual" | "spotify"; pending: boolean } | null;

export function withProgress(saved: ShownProgress, ops: SyncOp[]): ShownProgress {
  let p = saved;
  for (const op of ops) if (op.kind === "progress") p = op.percent === null ? null : { percent: op.percent, page: op.page, source: "manual", pending: true };
  return p;
}
