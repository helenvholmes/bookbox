// Six muted tints, light or dark with the page (src/app/globals.css).
const COLORS = 6;

/**
 * The first and last words' first letters: "Katie Ann Marsh" -> "KM", "Samantha Lee Jr." -> "SL". Whole characters, so an accented or emoji
 * first letter isn't cut in half, and words that start with no letter ("🦊 Fox") are skipped.
 */
export function initials(name: string) {
  // Suffixes like "Jr." and "III" aren't the last name.
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w) && !/^(jr|sr|ii|iii|iv)\.?$/i.test(w));
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return picked
    .map((w) => Array.from(w.normalize("NFC"))[0])
    .join("")
    .toUpperCase();
}

/** Muted initials circle; the colour is stable per person. */
export function Avatar({ id, name, className = "size-6 text-[0.625rem]" }: { id: number; name: string; className?: string }) {
  return (
    <span
      title={name}
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-medium text-ink/80 ${className}`}
      style={{ background: `var(--avatar-${id % COLORS})` }}
    >
      {initials(name) || (
        // A name with no letters to take: a plain person instead.
        <svg viewBox="0 0 24 24" className="size-[60%]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />
        </svg>
      )}
    </span>
  );
}
