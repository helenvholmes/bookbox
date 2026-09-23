"use client";

/** "Hello, / Monday, 22 September", in the device's own time zone. */
export function Greeting() {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return (
    <h1 className="display text-[2.125rem] leading-[1.1] sm:text-4xl">
      Hello,
      <span className="block text-faint" suppressHydrationWarning>
        {weekday}, {date}
      </span>
    </h1>
  );
}
