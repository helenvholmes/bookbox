"use client";

/* eslint-disable @next/next/no-img-element -- covers from OpenLibrary and Inventaire, before they're saved */
import { useState } from "react";

/**
 * A cover from a catalog. When it won't load (OpenLibrary's cover server is sometimes down), it tries
 * Inventaire's cover for the ISBN, then leaves an empty frame rather than a broken-image icon.
 * Give it a `key` of its `src` so a new cover starts over.
 */
export function LookupCover({ src, isbn, className, lazy = false }: { src: string; isbn: string | null; className: string; lazy?: boolean }) {
  const fallback = isbn ? `/api/isbn-cover?isbn=${isbn}` : null;
  const [current, setCurrent] = useState<string | null>(src);
  if (!current) return <div className={className} />;
  return (
    <img
      src={current}
      alt=""
      className={className}
      loading={lazy ? "lazy" : undefined}
      onError={() => setCurrent(current !== fallback ? fallback : null)}
    />
  );
}
