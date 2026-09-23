"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A title clamped to two lines that shows the full title in a tooltip on hover, only when it's
 * cut off. The tooltip is portalled to <body> because the tiles use content-visibility, which
 * clips anything that overflows them.
 */
export function ClampedTitle({ title, className = "" }: { title: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [truncated, setTruncated] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTruncated(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [title]);

  // Hide on scroll so the tooltip never drifts away from its title.
  useEffect(() => {
    if (!anchor) return;
    const hide = () => setAnchor(null);
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", hide, { capture: true });
  }, [anchor]);

  function show() {
    if (!truncated || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setAnchor({ x: r.left + r.width / 2, y: r.top });
  }

  return (
    <>
      <p ref={ref} className={`line-clamp-2 ${className}`} onMouseEnter={show} onMouseLeave={() => setAnchor(null)}>
        {title}
      </p>
      {anchor &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: anchor.x, top: anchor.y }}
            className="pointer-events-none fixed z-50 w-max max-w-60 -translate-x-1/2 -translate-y-[calc(100%+0.5rem)] rounded-md border border-line bg-raised px-2.5 py-1.5 text-center text-xs leading-snug text-ink shadow-[0_8px_24px_rgb(0_0_0/0.5)]"
          >
            {title}
          </span>,
          document.body,
        )}
    </>
  );
}
