import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import { OfflineSupport } from "@/components/OfflineSupport";
import { SpotifySync } from "@/components/SpotifySync";
import { getFacets } from "@/lib/books";

/**
 * The signed-in app: sidebar (or bottom tabs on phones) around every page. Nothing here waits on
 * the database, so the frame and the page's skeleton (loading.tsx) are sent straight away; the
 * sidebar's years fill in when their query returns.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh md:flex">
      <OfflineSupport />
      <SpotifySync />
      {/* Three steps, so the page never shifts sideways: an empty sidebar of the right size in the first
          bytes, then its links (Nav reads the URL's query string, which needs a Suspense boundary of its
          own), then the years once their query returns. */}
      <Suspense
        fallback={
          <Suspense fallback={<SidebarShell />}>
            <Nav years={[]} />
          </Suspense>
        }
      >
        <NavWithYears />
      </Suspense>
      <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] md:px-10 md:pt-8 md:pb-12">{children}</main>
    </div>
  );
}

/** Holds the desktop sidebar's place until the real one arrives. Phones have no sidebar, and their tab bar floats. */
function SidebarShell() {
  return (
    <aside aria-hidden className="sticky top-0 hidden h-dvh w-56 shrink-0 border-r border-line bg-[#0e0f11] px-3 py-5 md:block">
      <span className="display px-2.5 text-xl">BookBox</span>
    </aside>
  );
}

async function NavWithYears() {
  const { years } = await getFacets();
  return <Nav years={years} />;
}
