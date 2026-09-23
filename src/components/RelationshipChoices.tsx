import { RELATIONSHIPS } from "@/lib/constants";

export function RelationshipChoices({ selected }: { selected: string[] }) {
  return (
    <fieldset className="flex flex-wrap gap-3 text-sm">
      <legend className="sr-only">Relationship</legend>
      {RELATIONSHIPS.map((r) => (
        <label key={r} className="flex items-center gap-1.5">
          <input type="checkbox" name="relationship" value={r} defaultChecked={selected.includes(r)} className="size-4 accent-accent" />
          {r}
        </label>
      ))}
    </fieldset>
  );
}
