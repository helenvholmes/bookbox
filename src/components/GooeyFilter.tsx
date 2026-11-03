/**
 * An SVG "gooey" filter: anything drawn inside an element with `filter: url(#id)` is blurred, then
 * its edges are sharpened again, so shapes that come close melt into one another like drops of
 * liquid. The technique is Lucas Bebber's (https://css-tricks.com/gooey-effect/), as packaged by
 * Fancy Components' Gooey SVG Filter.
 *
 * Only put plain shapes in the filtered element: text and icons inside it would blur too.
 * Browsers that can't apply SVG filters to HTML show the shapes unfiltered, so use shapes that
 * still look right without it.
 */
export function GooeyFilter({ id, strength = 6 }: { id: string; strength?: number }) {
  return (
    <svg aria-hidden className="pointer-events-none absolute size-0">
      <defs>
        {/* Room on every side, so the blur isn't clipped while shapes are pulling apart. */}
        <filter id={id} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation={strength} result="blur" />
          {/* Keeps the colors and turns the blur's soft alpha back into a hard edge. */}
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
          {/* The original shapes, crisp, on top of the goo that joins them. */}
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}
