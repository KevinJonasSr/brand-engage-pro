import {
  shouldShowGuestResults,
  type GuestResults,
} from "@/lib/guest-results";

const fmt = new Intl.NumberFormat("en-US");

/**
 * Homepage results for Nellie's (item 17). Renders nothing until the
 * minimums in lib/guest-results.ts are met.
 */
export default function GuestResultsSection({
  results,
}: {
  results: GuestResults | null;
}) {
  if (!results || !shouldShowGuestResults(results)) return null;

  const stats = [
    { label: "Total visits", value: fmt.format(results.visits) },
    { label: "Repeat guests", value: fmt.format(results.repeatGuests) },
    { label: "Repeat rate", value: `${Math.round(results.repeatRate * 100)}%` },
    { label: "Visits, last 30 days", value: fmt.format(results.visits30d) },
  ];

  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <p className="text-xs uppercase tracking-widest text-iron/70">Results</p>
      <h2
        className="mt-2 text-3xl font-semibold md:text-4xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Guests keep coming back to Nellie&apos;s.
      </h2>
      <p className="mt-4 max-w-xl text-iron/70">
        Real member check-ins at Nellie&apos;s Southern Kitchen. Team and test
        accounts are not counted.
      </p>
      <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-iron/10 bg-parchment/30 p-5"
          >
            <p className="text-3xl font-semibold">{s.value}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-iron/70">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
