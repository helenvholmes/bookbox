import { CollectionHeader } from "@/components/CollectionHeader";

/**
 * Lists, Tags, Series and Stats share their title and tabs (CollectionHeader), which stay on screen
 * as you switch between them while only the page below loads. Their other pages (a list, a year in
 * review…) are outside this group and don't have them.
 */
export default function CollectionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CollectionHeader />
      <div className="pt-6">{children}</div>
    </>
  );
}
