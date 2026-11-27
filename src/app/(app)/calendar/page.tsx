import type { Metadata } from "next";
import { ReadingCalendar } from "@/components/ReadingCalendar";
import { logChoices, readingDays } from "@/lib/calendar";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const { month } = await props.searchParams;
  const [days, choices] = await Promise.all([readingDays(), logChoices()]);
  return (
    <div className="space-y-6 pb-6">
      <header>
        <h1 className="display text-3xl">Calendar</h1>
        <p className="mt-1 text-muted">The days you read: what, how, and for how long.</p>
      </header>
      <ReadingCalendar days={days} choices={choices} month={typeof month === "string" && /^\d{4}-\d{2}$/.test(month) ? month : null} />
    </div>
  );
}
