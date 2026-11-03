"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type PrefetchKind = NonNullable<Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]>["kind"];

/**
 * Links marked `data-prefetch="full"` (the tab bar, book covers) fetch their whole page, data and
 * all, as soon as a finger touches them, so the page is usually there by the time the tap ends.
 * Next.js's own fetching ahead only goes as far as a page's loading skeleton (its loading.tsx);
 * the data would otherwise wait for the tap. Fetching ahead is off in development.
 */
export function TouchPrefetch() {
  const router = useRouter();
  useEffect(() => {
    const onTouch = (e: TouchEvent) => {
      const link = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[data-prefetch="full"]');
      if (!link || link.origin !== location.origin) return;
      router.prefetch(link.pathname + link.search, { kind: "full" as PrefetchKind });
    };
    document.addEventListener("touchstart", onTouch, { capture: true, passive: true });
    return () => document.removeEventListener("touchstart", onTouch, { capture: true });
  }, [router]);
  return null;
}
