const STAR = "M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z";

/** Five small stars in the muted icon style: filled up to the rating, outlined after (all outlined when unrated). */
export function Stars({ rating, className = "size-3", label = true }: { rating: number | null; className?: string; label?: boolean }) {
  const filled = rating ?? 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-muted"
      role="img"
      aria-label={label ? (filled ? `${filled} out of 5 stars` : "Not rated") : undefined}
      aria-hidden={!label}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 24 24" className={`${className} ${n <= filled ? "" : "text-faint"}`} strokeWidth={1.7} strokeLinejoin="round" aria-hidden>
          <path d={STAR} fill={n <= filled ? "currentColor" : "none"} stroke="currentColor" />
        </svg>
      ))}
    </span>
  );
}
