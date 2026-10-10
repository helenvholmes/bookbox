export default function Loading() {
  return (
    <div className="space-y-6 pb-6" aria-hidden>
      <div className="h-9 w-40 rounded-md bg-raised" />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className="aspect-[2/3] rounded-sm bg-card" />
        ))}
      </div>
    </div>
  );
}
