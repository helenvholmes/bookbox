"use client";

import { usePathname } from "next/navigation";
import { COVER_NAME, pendingCover } from "@/lib/cover-handoff";
import { Cover } from "./Cover";

/** The book skeleton's cover: the one you just tapped (see src/lib/cover-handoff.ts), or a placeholder. */
export function PendingCover() {
  const p = pendingCover(usePathname().match(/^\/books\/(\d+)$/)?.[1]);
  if (!p) return <div className="aspect-[2/3] animate-pulse rounded-sm bg-raised motion-reduce:animate-none" />;
  return <Cover cover={p.cover} title={p.title} author={p.author} eager className="rounded-sm" transitionName={COVER_NAME} />;
}
