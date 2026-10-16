"use client";

import { useOptimistic, useTransition } from "react";
import { setAuthorGenderAction } from "@/app/(app)/authors/actions";

const OPTIONS = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "nonbinary", label: "Nonbinary" },
  { value: "", label: "Not known" },
];

/** An author's gender, saved as soon as it's picked. */
export function AuthorGenderSelect({ name, gender }: { name: string; gender: string | null }) {
  const [shown, setShown] = useOptimistic(gender ?? "");
  const [, startTransition] = useTransition();
  return (
    <select
      aria-label={`${name}: gender`}
      value={shown}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          setShown(next);
          await setAuthorGenderAction(name, next);
        });
      }}
      className="field w-36 shrink-0 py-1.5 text-sm"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
