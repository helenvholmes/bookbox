"use client";

import { deleteBookAction } from "@/app/(app)/books/actions";
import { lastPlaceOutside, scrollBackOnArrival } from "@/lib/history";
import { ConfirmButton } from "./ConfirmButton";

/**
 * "Delete book", which then goes back to the page you were on before the book (a shelf, a list, a
 * search), scrolled to where you were.
 */
export function DeleteBookForm({ id, title }: { id: number; title: string }) {
  return (
    <form
      action={(fd) => {
        const back = lastPlaceOutside(`/books/${id}`);
        fd.set("return_to", back ?? "/library");
        if (back) scrollBackOnArrival(back);
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
