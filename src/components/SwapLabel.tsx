/**
 * Two labels for one button ("Save" and "Saving…", "Copy" and "Copied") stacked in the same spot, with the button
 * sized to the wider: swapping them doesn't change its width and shift what's beside it.
 */
export function SwapLabel({ on, label, onLabel }: { on: boolean; label: React.ReactNode; onLabel: React.ReactNode }) {
  return (
    <span className="inline-grid justify-items-center [&>*]:[grid-area:1/1]">
      <span className={on ? "invisible" : undefined} aria-hidden={on || undefined}>
        {label}
      </span>
      <span className={on ? undefined : "invisible"} aria-hidden={!on || undefined}>
        {onLabel}
      </span>
    </span>
  );
}
