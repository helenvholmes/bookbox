// The kinds of usage event BookBox records (see usage.ts), shared by the server and the browser.

/** Sent by the browser (UsageTracker), through /api/usage. */
export const CLIENT_KINDS = ["open", "page", "rage_click", "js_error", "page_error"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

/** Recorded by the server, where the thing happens. */
export type ServerKind =
  | "sign_in"
  | "joined"
  | "book_added"
  | "book_edited"
  | "book_deleted"
  | "import_preview"
  | "import"
  | "connect"
  | "api_key";

export type UsageKind = ClientKind | ServerKind;

/** Where an added book's details came from: a pick from a catalog search, a scanned barcode, or typed in. */
export type AddedVia = "search" | "scan" | "manual";

/** The browser's name for the event it hands the tracker, so components needn't import it. */
export const USAGE_EVENT = "bookbox:usage";

/** Records an event from a client component, when the tracker is on the page (only for people other than the owner). */
export function trackInBrowser(kind: ClientKind, detail: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(USAGE_EVENT, { detail: { kind, detail } }));
}
