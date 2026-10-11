import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { listBrands } from "@/lib/brands";
import { brandWashBackground, resolveBrandAccent, withAlpha } from "@/lib/brand-accent";
import { getBrandFromDb } from "@/lib/data/brands";
import { getFoundingClaims } from "@/lib/founding";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface Founder {
  member_id: string;
  founder_number: number;
  first_name: string | null;
  avatar_url: string | null;
  joined_at: string;
}

interface FounderMembershipRow {
  member_id: string;
  founder_number: number | null;
  joined_at: string;
  members?: {
    first_name?: string | null;
    avatar_url?: string | null;
  } | Array<{
    first_name?: string | null;
    avatar_url?: string | null;
  }> | null;
}

export async function generateStaticParams() {
  return listBrands().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandFromDb(slug);
  if (!brand) return { title: "Founder Wall" };
  return {
    title: `Founding Members · ${brand.name}`,
    description: `See the founding members of ${brand.name} — the free first 100 who join.`,
  };
}

async function getFoundersForCommunity(
  communitySlug: string,
): Promise<{ founders: Founder[]; founderCap: number } | null> {
  try {
    const admin = createAdminClient();

    // Fetch community to get founder_cap
    const { data: community, error: communityError } = await admin
      .from("communities")
      .select("founder_cap")
      .eq("slug", communitySlug)
      .maybeSingle();

    if (communityError || !community) return null;

    // Fetch founders ordered by founder_number
    const { data: memberships, error: membershipsError } = await admin
      .from("member_community_memberships")
      .select(
        `
        member_id,
        founder_number,
        joined_at,
        members:members (
          id,
          first_name,
          avatar_url
        )
      `,
      )
      .eq("community_id", communitySlug)
      .eq("is_founder", true)
      .order("founder_number", { ascending: true });

    if (membershipsError || !memberships) return null;

    const founders: Founder[] = (memberships as FounderMembershipRow[])
      .filter((row): row is FounderMembershipRow & { founder_number: number } => row.founder_number !== null)
      .map((row) => {
        const member = Array.isArray(row.members) ? row.members[0] : row.members || {};
        return {
          member_id: row.member_id,
          founder_number: row.founder_number,
          first_name: member.first_name ?? null,
          avatar_url: member.avatar_url ?? null,
          joined_at: row.joined_at,
        };
      });

    const claims = await getFoundingClaims(communitySlug);
    return {
      founders,
      founderCap: claims.cap,
    };
  } catch {
    return null;
  }
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function getInitial(name: string | null): string {
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
}

export default async function FounderWallPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [brand, founderData] = await Promise.all([
    getBrandFromDb(slug),
    getFoundersForCommunity(slug),
  ]);

  if (!brand) notFound();
  if (!founderData) notFound();

  const { founders, founderCap } = founderData;
  const claimedCount = founders.length;
  const remainingCount = founderCap - claimedCount;
  const isFull = remainingCount <= 0;

  const palette = resolveBrandAccent(brand.accentFrom, brand.accentTo);
  const heroBackground = brandWashBackground(palette);

  return (
    <main className="mx-auto max-w-7xl space-y-10 px-6 py-12">
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-lg border border-iron/10 p-10"
        style={{ backgroundImage: heroBackground }}
      >
        <p className="text-xs uppercase tracking-[0.3em]" style={{ color: palette.accentInk }}>
          Founding Members
        </p>
        <h1
          className="mt-3 text-4xl font-semibold leading-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Founding Members of {brand.name}
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-iron/80">
          The free first 100 who join — a Founding badge. Brands pay, guests join free.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2 text-sm text-iron/85">
          <li className="rounded-full border border-iron/20 bg-iron/10 px-3 py-1">
            1.5x points for life
          </li>
          <li className="rounded-full border border-iron/20 bg-iron/10 px-3 py-1">
            RSVP to events 48 hours before everyone else
          </li>
        </ul>
      </section>

      {/* Scarcity Counter */}
      <section className="rounded-lg border border-iron/10 bg-iron/5 backdrop-blur p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-iron/70">Founder slots</p>
            <p className="mt-1 text-3xl font-semibold">
              {claimedCount} <span className="text-lg text-iron/70">/ {founderCap}</span>
            </p>
          </div>
          <div className="text-right">
            {isFull ? (
              <p className="text-sm font-semibold text-aurora-ink">
                All founder slots claimed
              </p>
            ) : (
              <>
                <p className="text-3xl font-semibold text-sage-ink">
                  {remainingCount}
                </p>
                <p className="mt-1 text-xs text-iron/70">
                  {remainingCount === 1 ? "spot" : "spots"} remaining
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Founders Grid or Empty State */}
      {founders.length === 0 ? (
        <section className="rounded-lg border border-iron/10 bg-iron/5 backdrop-blur p-12 text-center">
          <p className="text-lg font-semibold">Be the first.</p>
          <p className="mt-2 text-sm text-iron/70">
            Founding badges #{1}-{founderCap} go to the first members who join — free,
            not a Premium purchase.
          </p>
          <Link
            href={`/signup?ref=${encodeURIComponent(slug)}&next=${encodeURIComponent(`/brands/${slug}/founders`)}`}
            className="mt-6 inline-block rounded-full bg-ember px-6 py-3 text-sm font-semibold text-linen shadow-lg hover:brightness-110"
          >
            Join free for a Founding badge →
          </Link>
        </section>
      ) : (
        <section>
          <p className="mb-6 text-sm text-iron/70">
            {claimedCount} {claimedCount === 1 ? "founder" : "founders"}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {founders.map((founder) => (
              <div
                key={founder.member_id}
                className="group rounded-lg border border-iron/10 bg-iron/5 backdrop-blur p-4 text-center transition hover:bg-iron/10 hover:border-iron/20"
              >
                {/* Founder Number */}
                <div
                  className="relative mb-3 text-2xl font-bold"
                  style={{ color: palette.accentInk }}
                >
                  #{founder.founder_number}
                </div>

                {/* Avatar */}
                <div className="mb-3 flex justify-center">
                  {founder.avatar_url ? (
                    <Image
                      src={founder.avatar_url}
                      alt={founder.first_name || `Founder #${founder.founder_number}`}
                      width={56}
                      height={56}
                      className="rounded-full object-cover border border-iron/10 group-hover:border-iron/20"
                    />
                  ) : (
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-full border border-iron/10 group-hover:border-iron/20 text-lg font-semibold text-iron/70"
                      style={{
                        backgroundColor: withAlpha(palette.accent, 0.16),
                      }}
                    >
                      {getInitial(founder.first_name)}
                    </div>
                  )}
                </div>

                {/* Name */}
                <p className="text-sm font-semibold text-iron truncate">
                  {founder.first_name || `Founder #${founder.founder_number}`}
                </p>

                {/* Joined date */}
                <p className="mt-2 text-xs text-iron/70">
                  Member since {formatDate(founder.joined_at)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA at the bottom */}
      <section className="rounded-lg border border-iron/10 bg-iron/5 backdrop-blur p-8 text-center">
        <p className="text-lg font-semibold">
          {isFull
            ? "All Founding spots are claimed"
            : "Want to be a Founding Member?"}
        </p>
        <p className="mt-2 text-sm text-iron/70">
          {isFull
            ? "You can still join free and earn points toward every reward."
            : "Join free to claim a Founding badge. Brands pay, guests join free."}
        </p>
        <Link
          href={`/signup?ref=${encodeURIComponent(slug)}`}
          className="mt-6 inline-block rounded-full bg-ember px-6 py-3 text-sm font-semibold text-linen shadow-lg hover:brightness-110"
        >
          {isFull ? "Join free →" : "Become a Founding Member →"}
        </Link>
      </section>

      {/* Back link */}
      <div className="text-center">
        <Link
          href={`/brands/${slug}`}
          className="text-xs text-iron/70 hover:text-iron/70 transition"
        >
          ← Back to {brand.name}
        </Link>
      </div>
    </main>
  );
}
