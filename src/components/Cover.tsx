import { CoverImage } from "./CoverImage";

const PALETTE = ["#7c3a2d", "#2f4f4f", "#5b4a7a", "#8a6a2f", "#3d5a3a", "#6b3050", "#2d4a6b"];

export function Cover({
  cover,
  title,
  author,
  className = "",
  eager = false,
  bleed = false,
  srcBase = "/covers",
}: {
  cover: string | null;
  title: string;
  author?: string;
  className?: string;
  eager?: boolean;
  /** Edge to edge inside a card: square corners (the card clips them) and always fills the frame. */
  bleed?: boolean;
  /** Where cover files are served from (share pages use their own, token-checked route). */
  srcBase?: string;
}) {
  const rounding = bleed ? "" : "rounded-md";
  if (cover) {
    return (
      // A fixed 2:3 frame the cover fills (see CoverImage for how odd shapes fit).
      <div className={`aspect-[2/3] w-full overflow-hidden ${rounding} ${className}`}>
        <CoverImage src={`${srcBase}/${cover}`} eager={eager} alwaysFill={bleed} />
      </div>
    );
  }
  // A generated "spine" so books without covers still look like books.
  const color = PALETTE[[...title].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
  return (
    <div
      aria-hidden
      className={`flex aspect-[2/3] w-full flex-col justify-between overflow-hidden ${rounding} p-3 text-white ${className}`}
      style={{ background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 70%, black))` }}
    >
      <span className="line-clamp-4 text-sm leading-tight font-medium">{title}</span>
      {author && <span className="line-clamp-2 text-[0.6875rem] opacity-80">{author}</span>}
    </div>
  );
}
