"use client";

/* eslint-disable @next/next/no-img-element -- covers are already resized WebP served from our own route */
import { useCallback, useState } from "react";

const FRAME_RATIO = 2 / 3;

/**
 * Fills the 2:3 cover frame. Covers wider than the frame (which would leave space above and
 * below) fill its height and are trimmed at the sides, keeping their proportions; taller or
 * narrower ones are shown whole.
 */
export function CoverImage({ src, eager, alwaysFill = false }: { src: string; eager: boolean; alwaysFill?: boolean }) {
  const [measured, setFit] = useState<"object-contain" | "object-cover">("object-contain");
  const fit = alwaysFill ? "object-cover" : measured;

  const measure = useCallback((img: HTMLImageElement | null) => {
    if (!img?.naturalWidth) return;
    setFit(img.naturalWidth / img.naturalHeight > FRAME_RATIO + 0.005 ? "object-cover" : "object-contain");
  }, []);

  return (
    <img
      // The ref catches images that finished loading before hydration; onLoad catches the rest.
      ref={measure}
      onLoad={(e) => measure(e.currentTarget)}
      src={src}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={`size-full ${fit}`}
    />
  );
}
