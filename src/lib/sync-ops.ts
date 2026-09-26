/**
 * The edits the book page can make without a connection. They're queued on the device
 * (src/lib/outbox.ts) and sent to /api/sync, which applies them in order. Each one states the
 * result rather than a toggle ("status is Read", not "toggle Read"), so sending one twice is harmless.
 */

export const STATUSES = ["To Read", "Currently Reading", "Read", "Abandoned"] as const;
export const TEXT_FIELDS = ["review", "quotes", "private_notes"] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

type Base = { opId: string; bookId: number; at: number };

export type SyncOp = Base &
  (
    | { kind: "status"; shelf: (typeof STATUSES)[number] | null }
    | { kind: "rating"; rating: number | null }
    | { kind: "text"; field: TextField; value: string }
    | { kind: "addRead"; clientId: string; year: number; note: string }
    | { kind: "deleteRead"; readId: number | null; clientId: string | null }
    /** Progress by hand: a percentage, and the page it came from if entered as one. Null clears it. */
    | { kind: "progress"; percent: number | null; page: number | null }
  );

export type SyncResult = { applied: string[]; rejected: string[] };

const isId = (v: unknown) => typeof v === "string" && /^[\w-]{8,64}$/.test(v);
export const validYear = (y: unknown): y is number => Number.isInteger(y) && (y as number) > 1900 && (y as number) < 2200;

/** Whether an op from the client is well formed (the server checks before applying anything). */
export function isValidOp(op: unknown): op is SyncOp {
  if (!op || typeof op !== "object") return false;
  const o = op as Record<string, unknown>;
  if (!isId(o.opId) || !Number.isInteger(o.bookId) || typeof o.at !== "number") return false;
  switch (o.kind) {
    case "status":
      return o.shelf === null || (STATUSES as readonly unknown[]).includes(o.shelf);
    case "rating":
      return o.rating === null || (Number.isInteger(o.rating) && (o.rating as number) >= 1 && (o.rating as number) <= 5);
    case "text":
      return (TEXT_FIELDS as readonly unknown[]).includes(o.field) && typeof o.value === "string" && o.value.length <= 100_000;
    case "addRead":
      return isId(o.clientId) && validYear(o.year) && typeof o.note === "string" && o.note.length <= 1000;
    case "progress":
      return (
        (o.percent === null && o.page === null) ||
        (typeof o.percent === "number" && o.percent >= 0 && o.percent <= 100 && (o.page === null || (Number.isInteger(o.page) && (o.page as number) >= 0)))
      );
    case "deleteRead":
      return (Number.isInteger(o.readId) && o.clientId === null) || (o.readId === null && isId(o.clientId));
    default:
      return false;
  }
}
