// Oku-style status icons: bookmark, eye, check, clock.
const PATHS: Record<string, string> = {
  "To Read": "M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z",
  "Currently Reading": "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 2.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z",
  Read: "M20 6.5 9.5 17 4 11.5",
  Abandoned: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13.5V12l3 2",
};
const BOOK = "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Zm0 0A2.5 2.5 0 0 0 6.5 22H20v-5";

export const STATUS_SHELVES = ["To Read", "Currently Reading", "Read", "Abandoned"] as const;
export const shelfLabel = (s: string) => (s === "Currently Reading" ? "Reading" : s);

export function ShelfIcon({ shelf, className = "size-4" }: { shelf: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[shelf] ?? BOOK} />
    </svg>
  );
}
