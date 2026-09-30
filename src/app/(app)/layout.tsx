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
      {/* Nav reads the URL's query string, so both it and its placeholder need a Suspense boundary. */}
      <Suspense
        fallback={
          <Suspense>
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

async function NavWithYears() {
  const { years } = await getFacets();
  return <Nav years={years} />;
}
