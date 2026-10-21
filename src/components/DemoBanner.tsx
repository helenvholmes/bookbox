import { resetDemoAction } from "@/app/(app)/demo/actions";
import { SubmitButton } from "./SubmitButton";

/** Above every page of the demo: what it is, a way to start over, and where to get BookBox. */
export function DemoBanner() {
  return (
    <form action={resetDemoAction} role="note" className="card mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm text-muted">
      <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
      <span className="min-w-0 flex-1">You&rsquo;re trying BookBox. Changes aren&rsquo;t saved, and the library can start over at any time.</span>
      <span className="flex items-center gap-4">
        <SubmitButton className="text-ink underline disabled:no-underline disabled:opacity-60" pending="Starting over…">
          Start over
        </SubmitButton>
        <a href="https://bookbox.lol" className="font-medium text-ink hover:underline">
          Get BookBox
        </a>
      </span>
    </form>
  );
}
