// Six muted tints, light or dark with the page (src/app/globals.css).
const COLORS = 6;

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
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
      {initials(name)}
    </span>
  );
}
