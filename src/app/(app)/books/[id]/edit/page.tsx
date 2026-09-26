import { notFound } from "next/navigation";
import { BookForm } from "@/components/BookForm";
import { getBook } from "@/lib/books";
import { formOptions } from "@/lib/form-options";
import { deleteBookAction } from "../../actions";
import { ConfirmButton } from "@/components/ConfirmButton";

export const metadata = { title: "Edit book" };

export default async function EditBookPage(props: PageProps<"/books/[id]/edit">) {
  const { id } = await props.params;
  const [book, options] = await Promise.all([getBook(Number(id)), formOptions()]);
  if (!book) notFound();

  return (
    <div className="space-y-10 pb-6">
      <BookForm book={book} options={options} />
      <form action={deleteBookAction} className="border-t border-line pt-6 text-center">
        <input type="hidden" name="id" value={book.id} />
        <ConfirmButton className="btn btn-danger" message={`Delete “${book.title}”? This can't be undone.`}>
          Delete book
        </ConfirmButton>
      </form>
    </div>
  );
}
