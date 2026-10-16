"use client";

import { useState } from "react";

export function ExpandableText({ text, className = "" }: { text: string; className?: string }) {
  const long = text.length > 700;
  const [open, setOpen] = useState(!long);
  return (
    <div>
      <p className={`prose-text ${open ? "" : "line-clamp-6"} ${className}`}>{text}</p>
      {long && (
        <button type="button" className="mt-1 text-sm font-medium text-accent" onClick={() => setOpen((o) => !o)}>
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
