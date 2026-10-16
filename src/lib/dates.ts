/** Days as YYYY-MM-DD strings. Shared by the server and the browser; "today" always means the device's day. */

/** Today as YYYY-MM-DD in this device's own time zone (the server's is UTC, so pass the device's day to it). */
export function todayLocal(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

/** "Oct 3", or "Oct 3, 2025" when `withYear` is set. */
export function formatDay(day: string, withYear = false) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear && { year: "numeric" }) });
}

/** "Oct 3 – Oct 10", "Since Oct 3", or "Finished Oct 10". */
export function formatSpan(start: string | null, end: string | null) {
  if (start && end) return start === end ? formatDay(end) : `${formatDay(start)} – ${formatDay(end)}`;
  if (start) return `Started ${formatDay(start)}`;
  if (end) return `Finished ${formatDay(end)}`;
  return "";
}

/** The day after `day`. */
export function nextDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (b - a). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
