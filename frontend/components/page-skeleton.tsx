// Shared loading skeleton for route-level loading.tsx files. Keeps the
// linen page calm while a server component streams in.
export default function PageSkeleton({
  rows = 3,
  hero = true,
}: {
  rows?: number;
  hero?: boolean;
}) {
  return (
    <main
      aria-busy="true"
      aria-label="Loading"
      className="mx-auto max-w-5xl animate-pulse space-y-8 px-6 py-12"
    >
      {hero ? (
        <div className="space-y-4">
          <div className="h-3 w-24 rounded-full bg-iron/10" />
          <div className="h-9 w-2/3 max-w-md rounded-lg bg-iron/10" />
          <div className="h-4 w-1/2 max-w-sm rounded-full bg-iron/10" />
        </div>
      ) : null}
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-2xl border border-iron/10 bg-parchment/30"
          />
        ))}
      </div>
    </main>
  );
}
