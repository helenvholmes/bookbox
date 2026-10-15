"use client";

import { deleteBookAction } from "@/app/(app)/books/actions";
import { lastPlaceOutside } from "@/lib/history";
import { ConfirmButton } from "./ConfirmButton";

/** "Delete book", which then goes back to the page you were on before the book (a shelf, a list, a search). */
export function DeleteBookForm({ id, title }: { id: number; title: string }) {
  return (
    <form
      action={(fd) => {
        fd.set("return_to", lastPlaceOutside(`/books/${id}`) ?? "/library");
        return deleteBookAction(fd);
      }}
      className="border-t border-line pt-6 text-center"
    >
      <input type="hidden" name="id" value={id} />
      <ConfirmButton className="btn btn-danger" message={`Delete “${title}”? This can't be undone.`}>
        Delete book
      </ConfirmButton>
    </form>
  );
}
