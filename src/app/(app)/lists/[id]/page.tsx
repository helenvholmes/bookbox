import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/ConfirmButton";
import { RenameListForm } from "@/components/ListForms";
import { getList, listLists } from "@/lib/books";
import { deleteListAction } from "../actions";

export default async function ListPage(props: PageProps<"/lists/[id]">) {
  const { id } = await props.params;
  const list = await getList(Number(id));
  if (!list) notFound();
  const count = (await listLists()).find((l) => l.id === list.id)?.count ?? 0;

  return (
    <div className="space-y-6 pb-6">
      <Link href="/lists" className="block w-fit text-muted hover:text-ink">
        ‹ Lists
      </Link>
      <header className="flex items-end justify-between gap-3">
        <h1 className="display text-3xl">{list.name}</h1>
        <Link href={`/library?shelf=${encodeURIComponent(list.name)}`} className="btn shrink-0">
          {count} {count === 1 ? "book" : "books"}
        </Link>
      </header>

      <RenameListForm key={list.name} id={list.id} name={list.name} />

      <form action={deleteListAction} className="text-center">
        <input type="hidden" name="id" value={list.id} />
        <ConfirmButton className="btn btn-danger" message={`Delete the “${list.name}” list? Its books stay in your library.`}>
          Delete list
        </ConfirmButton>
      </form>
    </div>
  );
}
