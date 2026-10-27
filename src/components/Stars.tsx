// One star in a 24×24 box. Everything after the opening move is relative, so the same shape can be
// started anywhere: that's how all five share a few paths in one icon.
const STAR = "l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z";
// The star's left half, open along the middle so its stroke doesn't draw a line down the centre.
const HALF = "l-2.5 5.2-5.7.8 4.1 4-1 5.7L12 16.6";
const STEP = 28; // a 24-wide star plus a gap
const at = (shape: string, n: number) => `M${12 + n * STEP} 3.6${shape.replace("L12", `L${12 + n * STEP}`)}`;
const stars = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, i) => at(STAR, from + i)).join("");

/**
 * Five small stars in the muted icon style: filled up to the rating (half a star for a half),
 * outlined after (all outlined when unrated). One SVG with a few paths rather than five icons,
 * since grids show hundreds of these.
 *
 * `label` is what a screen reader hears: the rating by default, your own words, or nothing (false)
 * when the stars repeat something said nearby. `fill` colours the filled stars (they're muted otherwise).
 */
export function Stars({
  rating,
  className = "h-3",
  label = true,
  fill,
  filledClass = "text-muted",
}: {
  rating: number | null;
  className?: string;
  label?: boolean | string;
  fill?: string;
  /** For the rating pickers, which brighten the stars you're pointing at. */
  filledClass?: string;
}) {
  // Nearest half star: 3.5 shows three and a half.
  const shown = Math.min(5, Math.max(0, Math.round((rating ?? 0) * 2) / 2));
  const filled = Math.floor(shown);
  const half = shown > filled;
  const name = typeof label === "string" ? label : label ? (rating ? `${rating} out of 5 stars` : "Not rated") : undefined;
  const on = { className: fill ? undefined : filledClass, style: fill ? { color: fill } : undefined };
  return (
    <svg
      viewBox={`0 0 ${STEP * 5 - 4} 24`}
      className={`w-auto shrink-0 ${className}`}
      strokeWidth={1.7}
      strokeLinejoin="round"
      role={name ? "img" : undefined}
      aria-label={name}
      aria-hidden={!name || undefined}
    >
      {filled < 5 && <path d={stars(filled, 5)} fill="none" stroke="currentColor" className="text-faint" />}
      {filled > 0 && <path d={stars(0, filled)} fill="currentColor" stroke="currentColor" {...on} />}
      {half && <path d={at(HALF, filled)} fill="currentColor" stroke="currentColor" {...on} />}
    </svg>
  );
}

/** Which rating a point on a row of Stars stands for: the left half of a star is half a star. */
export function ratingAt(clientX: number, box: DOMRect) {
  const unit = ((clientX - box.left) / box.width) * (STEP * 5 - 4);
  const star = Math.min(4, Math.max(0, Math.floor(unit / STEP)));
  const within = (unit - star * STEP) / 24;
  return star + (within <= 0.5 ? 0.5 : 1);
}
