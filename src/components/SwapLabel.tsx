/**
 * Two labels for one button ("Save" and "Saving…", "Copy" and "Copied") stacked in the same spot, with the button
 * sized to the wider: swapping them doesn't change its width and shift what's beside it. They line up the way the
 * button's text does (centred, unless it's text-left), underlined if it is.
 */
export function SwapLabel({ on, label, onLabel }: { on: boolean; label: React.ReactNode; onLabel: React.ReactNode }) {
  return (
    // An underline doesn't carry into an inline-grid by itself, so the labels take the button's.
    <span className="inline-grid [text-decoration:inherit] [&>*]:[grid-area:1/1] [&>*]:[text-decoration:inherit]">
      <span className={on ? "invisible" : undefined} aria-hidden={on || undefined}>
        {label}
      </span>
      <span className={on ? undefined : "invisible"} aria-hidden={!on || undefined}>
        {onLabel}
      </span>
    </span>
  );
}
