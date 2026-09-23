/* eslint-disable @next/next/no-img-element -- covers are already resized WebP served from our own route */

const PALETTE = ["#7c3a2d", "#2f4f4f", "#5b4a7a", "#8a6a2f", "#3d5a3a", "#6b3050", "#2d4a6b"];

export function Cover({
  cover,
  title,
  author,
  className = "",
  eager = false,
}: {
  cover: string | null;
  title: string;
  author?: string;
  className?: string;
  eager?: boolean;
}) {
  if (cover) {
    return (
      <img
        src={`/covers/${cover}`}
        alt=""
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={`aspect-[2/3] w-full rounded-md bg-line object-cover ${className}`}
      />
    );
  }
  // A generated "spine" so books without covers still look like books.
  const color = PALETTE[[...title].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
  return (
    <div
      aria-hidden
      className={`flex aspect-[2/3] w-full flex-col justify-between overflow-hidden rounded-md p-3 text-white ${className}`}
      style={{ background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 70%, black))` }}
    >
      <span className="line-clamp-4 text-sm leading-tight font-medium">{title}</span>
      {author && <span className="line-clamp-2 text-[0.6875rem] opacity-80">{author}</span>}
    </div>
  );
}
