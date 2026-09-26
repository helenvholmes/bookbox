import "server-only";
import type { FormOptions } from "@/components/BookForm";
import { getFacets, seriesNames } from "./books";

export async function formOptions(): Promise<FormOptions> {
  const facets = await getFacets();
  return {
    shelves: facets.shelves.map((s) => s.name),
    tags: facets.tags.map((t) => t.name),
    people: facets.people.map((p) => ({ value: String(p.id), label: p.name })),
    series: await seriesNames(),
  };
}
