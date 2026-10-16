import type { Metadata } from "next";
import { ReadingCalendar } from "@/components/ReadingCalendar";
import { readingSpans } from "@/lib/calendar";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const { month } = await props.searchParams;
  const spans = await readingSpans();
  return (
    <div className="space-y-6 pb-6">
      <header>
        <h1 className="display text-3xl">Calendar</h1>
        <p className="mt-1 text-muted">What you were reading, day by day.</p>
      </header>
      <ReadingCalendar spans={spans} month={typeof month === "string" && /^\d{4}-\d{2}$/.test(month) ? month : null} />
    </div>
  );
}
