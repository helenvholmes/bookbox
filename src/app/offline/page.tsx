import { OfflineLibrary } from "@/components/OfflineLibrary";

export const metadata = { title: "Offline" };

/**
 * What the service worker shows for a page it hasn't saved. It holds no data itself (so it can be
 * cached and served without signing in); the library comes from the saved search index.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-12 md:px-10 md:pt-8">
      <OfflineLibrary />
    </main>
  );
}
