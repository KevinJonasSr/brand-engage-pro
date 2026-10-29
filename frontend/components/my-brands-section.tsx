import Link from "next/link";
import { tierLabel, type MyBrandItem } from "./brand-directory-helpers";

/** "My brands" block at the top of /me: the clubs this member belongs to. */
export default function MyBrandsSection({ items }: { items: MyBrandItem[] }) {
  return (
    <section aria-labelledby="my-brands-heading" className="mb-10">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-iron/70">
            My brands
          </p>
          <h2 id="my-brands-heading" className="mt-1 text-xl font-semibold">
            {items.length === 0
              ? "You haven’t joined a club yet"
              : `${items.length} ${items.length === 1 ? "club" : "clubs"}`}
          </h2>
        </div>
        <Link
          href="/brands"
          className="text-sm font-medium text-ember underline-offset-2 hover:underline"
        >
          {items.length === 0 ? "Browse brands →" : "Add more →"}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-iron/20 bg-iron/[0.02] p-5 text-sm text-iron/70">
          Follow a brand to collect points, unlock rewards, and hear about
          events first.{" "}
          <Link href="/brands" className="font-medium text-iron underline-offset-2 hover:underline">
            See the member clubs
          </Link>
          .
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((b) => {
            const tier = tierLabel(b.tier);
            return (
              <li
                key={b.slug}
                className="flex items-center justify-between gap-3 rounded-xl border border-iron/10 bg-iron/[0.02] p-4"
              >
                <div className="min-w-0">
                  <Link
                    href={b.href}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {b.name}
                  </Link>
                  <div className="mt-0.5 text-sm text-iron/70">
                    {tier ? `${tier} tier` : "Following"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm">
                  <Link
                    href={b.rewardsHref}
                    className="rounded-full border border-iron/15 px-3 py-1 text-iron/80 transition hover:border-iron/30 hover:text-iron"
                  >
                    Rewards
                  </Link>
                  <Link href={b.href} aria-label={`Open ${b.name}`} className="text-iron/70 hover:text-iron">
                    →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
