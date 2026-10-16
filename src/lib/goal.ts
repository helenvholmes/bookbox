/** Where a year's reading goal stands: how many books you'd have read by today at an even pace. */
export function goalPace(year: number, goal: number | null, read: number, now = new Date()) {
  if (!goal) return null;
  const daysInYear = new Date(year, 1, 29).getMonth() === 1 ? 366 : 365;
  const dayOfYear = Math.floor((now.getTime() - new Date(year, 0, 1).getTime()) / 86_400_000) + 1;
  const expected = Math.round((goal * Math.min(Math.max(dayOfYear, 0), daysInYear)) / daysInYear);
  const status: "reached" | "on-track" | "behind" = read >= goal ? "reached" : read >= expected ? "on-track" : "behind";
  return { expected, percent: Math.min(100, Math.round((read / goal) * 100)), status };
}
