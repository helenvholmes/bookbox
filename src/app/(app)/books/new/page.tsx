import { BookForm } from "@/components/BookForm";
import { formOptions } from "@/lib/form-options";

export const metadata = { title: "Add a book" };

export default async function NewBookPage(props: PageProps<"/books/new">) {
  const { scan } = await props.searchParams;
  return (
    <div className="pb-6">
      <BookForm options={await formOptions()} startScanning={scan === "1"} />
    </div>
  );
}
