import { resetDemoAction } from "@/app/(app)/demo/actions";
import { SubmitButton } from "./SubmitButton";

/**
 * Above every page of the demo: what it is, a way to start over, and where to get BookBox. One row from sm up; on
 * phones the links go on a line of their own under the sentence, lined up with its text.
 */
export function DemoBanner() {
  return (
    <form
      action={resetDemoAction}
      role="note"
      className="card mb-6 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-sm text-muted sm:flex sm:gap-x-4"
    >
      {/* Beside the sentence's first line on phones, where it can run to two. */}
      <span className="mt-[0.45rem] size-1.5 shrink-0 self-start rounded-full bg-accent sm:mt-0 sm:self-auto" aria-hidden />
      <span className="min-w-0 sm:flex-1">You&rsquo;re trying BookBox. Changes aren&rsquo;t saved, and the library can start over at any time.</span>
      <span className="col-start-2 flex items-center gap-4">
        <SubmitButton className="text-ink underline disabled:no-underline disabled:opacity-60" pending="Starting over…" keepWidth={false}>
          Start over
        </SubmitButton>
        <a href="https://bookbox.lol" className="font-medium text-ink hover:underline">
          Get BookBox
        </a>
      </span>
    </form>
  );
}
