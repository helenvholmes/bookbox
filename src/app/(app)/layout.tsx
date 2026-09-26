import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import { OfflineSupport } from "@/components/OfflineSupport";
import { getFacets } from "@/lib/books";

/** The signed-in app: sidebar (or bottom tabs on phones) around every page. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { years } = await getFacets();
  return (
    <div className="min-h-dvh md:flex">
      <OfflineSupport />
      <Suspense>
        <Nav years={years} />
      </Suspense>
      <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] md:px-10 md:pt-8 md:pb-12">{children}</main>
    </div>
  );
}
