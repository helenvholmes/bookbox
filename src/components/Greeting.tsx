"use client";

import { OWNER_NAME } from "@/lib/constants";

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd, 23rd … 31st */
function ordinal(n: number) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** "Hello, Helen / It's Monday, September 22nd", in the device's own time zone. */
export function Greeting() {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  const date = `${now.toLocaleDateString("en-US", { month: "long" })} ${ordinal(now.getDate())}`;
  return (
    <h1 className="display text-[2.125rem] leading-[1.1] sm:text-4xl">
      Hello, {OWNER_NAME}
      <span className="block text-faint" suppressHydrationWarning>
        It&rsquo;s {weekday}, {date}
      </span>
    </h1>
  );
}
