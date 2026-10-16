import { Suspense } from "react";
import { LocalCopyBanner } from "@/components/LocalCopyBanner";
import { Nav } from "@/components/Nav";
import { PageMotion } from "@/components/PageMotion";
import { OfflineSupport } from "@/components/OfflineSupport";
import { BackgroundSync } from "@/components/BackgroundSync";
import { authEnabled } from "@/lib/auth";
import { getFacets, listLists } from "@/lib/books";

/**
 * The signed-in app: sidebar (or bottom tabs on phones) around every page. Nothing here waits on
 * the database, so the frame and the page's skeleton (loading.tsx) are sent straight away; the
 * sidebar's years fill in when their query returns.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh md:flex">
      {/* The first thing a keyboard reaches, so the sidebar's thirty-odd links can be passed over. */}
      <a
        href="#main"
        className="sr-only rounded-lg bg-accent text-sm font-medium text-accent-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-4 focus:py-2.5"
      >
        Skip to content
      </a>
      <OfflineSupport />
      <BackgroundSync />
      {/* Reads the URL's query string, so it needs a Suspense boundary of its own. */}
      <Suspense>
        <PageMotion />
      </Suspense>
      {process.env.NODE_ENV === "development" && <LocalCopyNotice />}
      {/* Three steps, so the page never shifts sideways: an empty sidebar of the right size in the first
          bytes, then its links (Nav reads the URL's query string, which needs a Suspense boundary of its
          own), then the years and lists once their query returns. */}
      <Suspense
        fallback={
          <Suspense fallback={<SidebarShell />}>
            <Nav years={[]} lists={[]} canSignOut={authEnabled()} />
          </Suspense>
        }
      >
        <NavWithYears />
      </Suspense>
      <main id="main" tabIndex={-1} className="mx-auto outline-none w-full max-w-5xl min-w-0 flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] md:px-10 md:pt-8 md:pb-12">{children}</main>
    </div>
  );
}

/** Holds the desktop sidebar's place until the real one arrives. Phones have no sidebar, and their tab bar floats. */
function SidebarShell() {
  return (
    <aside aria-hidden style={{ viewTransitionName: "sidebar" }} className="sticky top-0 hidden h-dvh w-56 shrink-0 border-r border-line bg-[#0e0f11] px-3 py-5 md:block">
      <span className="display px-2.5 text-xl">BookBox</span>
    </aside>
  );
}

/** Local development: offer to refresh this computer's copy from the hosted library when it's old. */
async function LocalCopyNotice() {
  const { canPull, isStale, lastPulled } = await import("@/lib/pull-cloud");
  if (!canPull() || !isStale()) return null;
  return <LocalCopyBanner pulledAt={lastPulled()} />;
}

async function NavWithYears() {
  const [{ years }, lists] = await Promise.all([getFacets(), listLists()]);
  return <Nav years={years} lists={lists} canSignOut={authEnabled()} />;
}
