"use client";

import { useSyncExternalStore } from "react";

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd, 23rd … 31st */
function ordinal(n: number) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

function today() {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  return `It’s ${weekday}, ${now.toLocaleDateString("en-US", { month: "long" })} ${ordinal(now.getDate())}`;
}

const noSubscribe = () => () => {};

/**
 * "Hello, Helen / It's Monday, September 22nd", in the device's own time zone. The date is left
 * out of the server render (the server runs on UTC, a day ahead every evening in the Americas)
 * and filled in once the page is in the browser.
 */
export function Greeting({ name }: { name: string | null }) {
  const date = useSyncExternalStore(noSubscribe, today, () => null);
  return (
    <h1 className="display text-[2.125rem] leading-[1.1] sm:text-4xl">
      {name ? `Hello, ${name}` : "Hello"}
      <span className="block text-faint">{date ?? " "}</span>
    </h1>
  );
}
