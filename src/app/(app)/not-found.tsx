import Link from "next/link";

export const metadata = { title: "Not found" };

/** A book, person, series or tag that isn't there (deleted, merged, or a mistyped link). */
export default function NotFound() {
  return (
    <div className="space-y-4 py-16 text-center">
      <h1 className="display text-3xl">Not found</h1>
      <p className="text-muted">There&rsquo;s nothing at this address. It may have been deleted or merged.</p>
      <Link href="/library" className="btn rounded-full px-5">
        Library
      </Link>
    </div>
  );
}
