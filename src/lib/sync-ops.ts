/**
 * The edits the book page can make without a connection. They're queued on the device
 * (src/lib/outbox.ts) and sent to /api/sync, which applies them in order. Each one states the
 * result rather than a toggle ("status is Read", not "toggle Read"), so sending one twice is harmless.
 */

import { isDay } from "./dates";

export const STATUSES = ["To Read", "Currently Reading", "Read", "Abandoned"] as const;
export const TEXT_FIELDS = ["review", "quotes", "private_notes"] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

type Base = { opId: string; bookId: number; at: number };

export type SyncOp = Base &
  (
    /** `date` is the device's day, which starts a read when the book moves to Currently Reading. */
    | { kind: "status"; shelf: (typeof STATUSES)[number] | null; date?: string }
    | { kind: "rating"; rating: number | null }
    | { kind: "text"; field: TextField; value: string }
    | { kind: "addRead"; clientId: string; year: number; note: string; startedOn?: string | null; finishedOn?: string | null }
    | { kind: "deleteRead"; readId: number | null; clientId: string | null }
    /** A read's start and finish days. A finish day also sets the read's year. */
    | { kind: "readDates"; readId: number | null; clientId: string | null; startedOn: string | null; finishedOn: string | null }
    /** When the read in progress began. */
    | { kind: "startedOn"; date: string | null }
    /** Progress by hand: a percentage, and the page it came from if entered as one. Null clears it. */
    | { kind: "progress"; percent: number | null; page: number | null }
  );

export type SyncResult = { applied: string[]; rejected: string[] };

const isId = (v: unknown) => typeof v === "string" && /^[\w-]{8,64}$/.test(v);
const dayOrNull = (v: unknown) => v === null || isDay(v);
const optionalDay = (v: unknown) => v === undefined || dayOrNull(v);
const inOrder = (start: unknown, end: unknown) => !start || !end || (start as string) <= (end as string);
const readRef = (o: Record<string, unknown>) => (Number.isInteger(o.readId) && o.clientId === null) || (o.readId === null && isId(o.clientId));

export const validYear = (y: unknown): y is number => Number.isInteger(y) && (y as number) > 1900 && (y as number) < 2200;

/** Whether an op from the client is well formed (the server checks before applying anything). */
export function isValidOp(op: unknown): op is SyncOp {
  if (!op || typeof op !== "object") return false;
  const o = op as Record<string, unknown>;
  if (!isId(o.opId) || !Number.isInteger(o.bookId) || typeof o.at !== "number") return false;
  switch (o.kind) {
    case "status":
      return (o.shelf === null || (STATUSES as readonly unknown[]).includes(o.shelf)) && (o.date === undefined || isDay(o.date));
    case "rating":
      return o.rating === null || (Number.isInteger(o.rating) && (o.rating as number) >= 1 && (o.rating as number) <= 5);
    case "text":
      return (TEXT_FIELDS as readonly unknown[]).includes(o.field) && typeof o.value === "string" && o.value.length <= 100_000;
    case "addRead":
      return (
        isId(o.clientId) &&
        validYear(o.year) &&
        typeof o.note === "string" &&
        o.note.length <= 1000 &&
        optionalDay(o.startedOn) &&
        optionalDay(o.finishedOn) &&
        inOrder(o.startedOn, o.finishedOn)
      );
    case "progress":
      return (
        (o.percent === null && o.page === null) ||
        (typeof o.percent === "number" && o.percent >= 0 && o.percent <= 100 && (o.page === null || (Number.isInteger(o.page) && (o.page as number) >= 0)))
      );
    case "deleteRead":
      return readRef(o);
    case "readDates":
      return readRef(o) && dayOrNull(o.startedOn) && dayOrNull(o.finishedOn) && inOrder(o.startedOn, o.finishedOn);
    case "startedOn":
      return dayOrNull(o.date);
    default:
      return false;
  }
}
