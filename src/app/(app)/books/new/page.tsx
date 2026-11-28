import { BookForm } from "@/components/BookForm";
import { formOptions } from "@/lib/form-options";
import { withShareLibrary } from "@/lib/owners";
import { getSharedRecord } from "@/lib/share";

export const metadata = { title: "Add a book" };

export default async function NewBookPage(props: PageProps<"/books/new">) {
  const { scan, share, book } = await props.searchParams;
  // Opened from a book on a share page: its details, from the library that shared it, fill in the form.
  const shared =
    typeof share === "string" && typeof book === "string"
      ? await withShareLibrary(share, () => getSharedRecord(share, Number(book)))
      : null;
  return (
    <div className="pb-6">
      <BookForm
        options={await formOptions()}
        startScanning={scan === "1"}
        fromShare={shared ? { token: share as string, bookId: Number(book), record: shared } : undefined}
      />
    </div>
  );
}
