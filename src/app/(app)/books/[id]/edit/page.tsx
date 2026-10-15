import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookForm } from "@/components/BookForm";
import { getBook } from "@/lib/books";
import { formOptions } from "@/lib/form-options";
import { DeleteBookForm } from "@/components/DeleteBookForm";

export async function generateMetadata(props: PageProps<"/books/[id]/edit">): Promise<Metadata> {
  const book = await getBook(Number((await props.params).id));
  return { title: book ? `Edit ${book.title}` : "Edit book" };
}

export default async function EditBookPage(props: PageProps<"/books/[id]/edit">) {
  const { id } = await props.params;
  const [book, options] = await Promise.all([getBook(Number(id)), formOptions()]);
  if (!book) notFound();

  return (
    <div className="space-y-10 pb-6">
      <BookForm book={book} options={options} />
      <DeleteBookForm id={book.id} title={book.title} />
    </div>
  );
}
