"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { SyncOp, SyncResult } from "./sync-ops";

/**
 * Edits waiting to reach the server, kept in localStorage so they survive closing the app.
 * Every edit goes through here, online or not: it's saved first, shown straight away (components
 * lay pending edits over what the server sent), then sent to /api/sync. What doesn't get through
 * stays queued and is retried when the app is next online (see OfflineSupport).
 */

const KEY = "bookbox:outbox:v1";
export const SYNCED_EVENT = "bookbox:synced";

export type SyncState = "idle" | "syncing" | "offline" | "signed-out";
type Snapshot = { ops: SyncOp[]; state: SyncState };

const EMPTY: Snapshot = { ops: [], state: "idle" };
let snapshot: Snapshot = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

// If storage is full or blocked, the queue lives in memory instead: edits still show and sync
// while the app stays open, they just don't survive closing it.
let memory: SyncOp[] = [];
let storageOk = true;

function read(): SyncOp[] {
  if (!storageOk) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SyncOp[]) : [];
  } catch {
    storageOk = false;
    return memory;
  }
}

function write(ops: SyncOp[]) {
  memory = ops;
  if (!storageOk) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch {
    storageOk = false;
  }
}

function set(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  snapshot = { ops: read(), state: "idle" };
  // Another tab (or the home screen app) changed the queue.
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) set({ ops: read() });
  });
}

function subscribe(listener: () => void) {
  ensureLoaded();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => {
  ensureLoaded();
  return snapshot;
};
const getServerSnapshot = () => EMPTY;

export function useOutbox(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The pending edits for one book, oldest first. */
export function usePendingOps(bookId: number): SyncOp[] {
  const { ops } = useOutbox();
  return useMemo(() => ops.filter((op) => op.bookId === bookId), [ops, bookId]);
}

type NewOp = SyncOp extends infer T ? (T extends SyncOp ? Omit<T, "opId" | "at"> : never) : never;

export const newId = () => crypto.randomUUID();

/** Queues an edit and tries to send it right away. */
export function submit(op: NewOp) {
  ensureLoaded();
  const full = { ...op, opId: newId(), at: Date.now() } as SyncOp;
  const ops = [...read(), full];
  write(ops);
  set({ ops });
  void flush();
}

let flushing: Promise<void> | null = null;

/** Sends everything queued. Safe to call often; only one send runs at a time. */
export function flush(): Promise<void> {
  ensureLoaded();
  // Cleared in .finally, which always runs after this assignment (clearing it inside `send` could
  // run first, when there's nothing to send, and leave a finished promise here for good).
  flushing ??= send().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function send() {
  for (;;) {
    const ops = read();
    if (!ops.length) {
      set({ ops, state: "idle" });
      return;
    }
    set({ ops, state: "syncing" });
    let res: Response;
    try {
      res = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops }) });
    } catch {
      set({ state: "offline" });
      return;
    }
    if (res.status === 401) {
      set({ state: "signed-out" });
      return;
    }
    if (!res.ok) {
      set({ state: "offline" }); // the server is having trouble; try again later
      return;
    }
    const { applied, rejected } = (await res.json()) as SyncResult;
    const done = new Set([...applied, ...rejected]);
    // Keep anything queued while this request was in flight.
    const remaining = read().filter((op) => !done.has(op.opId));
    write(remaining);
    set({ ops: remaining });
    const books = [...new Set(ops.filter((op) => done.has(op.opId)).map((op) => op.bookId))];
    window.dispatchEvent(new CustomEvent(SYNCED_EVENT, { detail: { books } }));
    if (!done.size) return; // nothing was accepted; don't loop
  }
}
