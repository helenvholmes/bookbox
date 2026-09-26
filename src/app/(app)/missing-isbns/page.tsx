import Link from "next/link";
import { IsbnPicker } from "@/components/IsbnPicker";
import { listMissingIsbns } from "@/lib/books";

export const metadata = { title: "Missing ISBNs" };

export default async function MissingIsbnsPage() {
  const books = await listMissingIsbns();
  const invalid = books.filter((b) => b.bad_isbn).length;

  return (
    <div className="space-y-6 pb-6">
      <Link href="/" className="block w-fit text-muted hover:text-ink">
        ‹ Library
      </Link>
      <header>
        <h1 className="display text-3xl">Missing ISBNs</h1>
        <p className="mt-1 text-sm text-muted">
          {books.length === 0
            ? "Every book has an ISBN."
            : `${books.length} ${books.length === 1 ? "book has" : "books have"} no ISBN${invalid ? `; the ${invalid} with an invalid one from Airtable are first` : ""}. An ISBN lets the OpenLibrary refresh and cover search find the right edition.`}
        </p>
      </header>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {books.map((b) => (
          <IsbnPicker key={b.id} book={b} />
        ))}
      </ul>
    </div>
  );
}
