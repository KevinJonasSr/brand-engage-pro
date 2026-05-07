import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { absoluteDate } from "@/lib/format/relative-time";

export const metadata = { title: "Anniversaries" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Entry = {
  id: string;
  scope_slug: string;
  scope_name: string;
  milestone: string;
  label: string;
  celebrated_at: string;
  points_awarded: number;
};

const MILESTONE_LABELS: Record<string, string> = {
  "1_month": "1 month",
  "3_months": "3 months",
  "6_months": "6 months",
  "1_year": "1 year",
  "2_years": "2 years",
  "3_years": "3 years",
  "5_years": "5 years",
};

function fallbackLabel(milestone: string): string {
  return MILESTONE_LABELS[milestone] ?? milestone.replace(/_/g, " ");
}

export default async function AnniversariesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/anniversaries");

  const entries: Entry[] = [];

  const configs: Array<{ tbl: string; fkCol: string; slugCol: string }> = [
    { tbl: "fan_anniversary_log", fkCol: "fan_id", slugCol: "artist_slug" },
    { tbl: "member_anniversary_log", fkCol: "member_id", slugCol: "brand_slug" },
  ];

  for (const cfg of configs) {
    const { data, error } = await supabase
      .from(cfg.tbl)
      .select(
        "id, " +
          cfg.slugCol +
          ", milestone, celebrated_at, points_awarded, metadata"
      )
      .eq(cfg.fkCol, user.id)
      .order("celebrated_at", { ascending: false });
    if (!error && data && data.length > 0) {
      for (const r of data as unknown as Array<{
        id: string;
        milestone: string;
        celebrated_at: string;
        points_awarded: number;
        metadata: { brand_name?: string; artist_name?: string; label?: string } | null;
        [k: string]: unknown;
      }>) {
        const slug = String(r[cfg.slugCol] ?? "");
        const meta = r.metadata ?? {};
        const scopeName = meta.brand_name ?? meta.artist_name ?? slug;
        entries.push({
          id: r.id,
          scope_slug: slug,
          scope_name: scopeName,
          milestone: r.milestone,
          label:
            meta.label ??
            fallbackLabel(r.milestone) + " with " + scopeName,
          celebrated_at: r.celebrated_at,
          points_awarded: r.points_awarded,
        });
      }
      break;
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <nav className="mb-6 text-sm">
        <Link href="/me" className="text-white/50 hover:text-white">
          ← Account
        </Link>
      </nav>

      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-white/60">
          Milestones
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Your anniversaries
        </h1>
        <p className="mt-3 text-white/70">
          Every milestone with a community you follow.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <p className="text-white/70">
            No milestones yet — keep showing up. Your first 1-month
            anniversary will appear here automatically.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4"
            >
              <span aria-hidden className="mt-0.5 text-2xl">
                🎉
              </span>
              <div className="flex-1">
                <div className="font-medium">{e.label}</div>
                <p className="mt-0.5 text-sm text-white/60">
                  {absoluteDate(e.celebrated_at)}
                  {e.points_awarded > 0 && (
                    <>
                      {" · "}
                      <span className="text-emerald-300">
                        +{e.points_awarded.toLocaleString()} pts
                      </span>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
