/** Shared by the server (Spotify sync) and the book page. */

/** An audiobook counts as finished from here: the last few minutes are usually credits. */
export const FINISHED_PERCENT = 98;

/** 18_720_000 -> "5h 12m", 2_400_000 -> "40m". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/** "just now", "5 min ago", "3 hours ago", "2 days ago", from a SQLite UTC datetime. */
export function ago(sqliteUtc: string, now = Date.now()): string {
  const then = Date.parse(`${sqliteUtc.replace(" ", "T")}Z`);
  const minutes = Math.round((now - then) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
