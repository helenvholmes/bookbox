import Link from "next/link";
import { CoverPicker } from "@/components/CoverPicker";
import { listMissingCovers } from "@/lib/books";

export const metadata = { title: "Missing covers" };

export default async function MissingCoversPage() {
  const books = await listMissingCovers();

  return (
    <div className="space-y-6 pb-6">
      <Link href="/" className="block w-fit text-muted hover:text-ink">
        ‹ Library
      </Link>
      <header>
        <h1 className="display text-3xl">Missing covers</h1>
        <p className="mt-1 font-semibold text-muted">
          {books.length === 0
            ? "Every book has a cover."
            : `${books.length} ${books.length === 1 ? "book needs" : "books need"} a cover. Books with an ISBN are first; they're the easiest to match.`}
        </p>
      </header>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {books.map((b) => (
          <CoverPicker key={b.id} book={b} />
        ))}
      </ul>
    </div>
  );
}
