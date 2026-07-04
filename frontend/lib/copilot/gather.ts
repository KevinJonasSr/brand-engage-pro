import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Brand Copilot — metric gathering.
 *
 * Pulls a 7-30 day pulse of one brand community so the copilot prompt
 * (and the /admin/copilot UI) can reason over real numbers: growth,
 * engagement, points economy, upcoming events, redemption backlog, top
 * members, and — the churn-risk signal — members who were engaged but
 * have gone quiet.
 */

export interface QuietMember {
  memberId: string;
  displayName: string | null;
  totalPoints: number;
  lastActiveDate: string | null;
  daysQuiet: number;
}

export interface TopMember {
  memberId: string;
  displayName: string | null;
  totalPoints: number;
  isFounder: boolean;
}

export interface CommunityPulse {
  communityId: string;
  displayName: string;
  memberCount: number;
  newMembers7d: number;
  newMembers30d: number;
  activeMembers7d: number;
  pointsAwarded7d: number;
  posts7d: number;
  comments7d: number;
  rsvpsUpcoming: number;
  nextEvent: { title: string; startsAt: string; rsvps: number } | null;
  pendingRedemptions: number;
  topMembers: TopMember[];
  quietMembers: QuietMember[]; // churn risk: engaged before, silent 14–60 days
  founderCount: number;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export async function gatherCommunityPulse(
  communityId: string,
): Promise<CommunityPulse> {
  const admin = createAdminClient();

  const [
    community,
    members,
    new7,
    new30,
    ledger7,
    posts7,
    comments7,
    nextEvents,
    pendingRedemptions,
    topMemberships,
    founderCount,
  ] = await Promise.all([
    admin.from("communities").select("display_name").eq("slug", communityId).maybeSingle(),
    admin.from("member_community_memberships").select("member_id", { count: "exact", head: true }).eq("community_id", communityId),
    admin.from("member_community_memberships").select("member_id", { count: "exact", head: true }).eq("community_id", communityId).gte("joined_at", daysAgoIso(7)),
    admin.from("member_community_memberships").select("member_id", { count: "exact", head: true }).eq("community_id", communityId).gte("joined_at", daysAgoIso(30)),
    admin.from("points_ledger").select("member_id, delta").eq("community_id", communityId).gte("created_at", daysAgoIso(7)),
    admin.from("community_posts").select("id", { count: "exact", head: true }).eq("brand_slug", communityId).gte("created_at", daysAgoIso(7)),
    admin.from("community_comments").select("id, community_posts!inner(brand_slug)", { count: "exact", head: true }).eq("community_posts.brand_slug", communityId).gte("created_at", daysAgoIso(7)),
    admin.from("brand_events").select("id, title, starts_at").eq("brand_slug", communityId).gte("starts_at", new Date().toISOString()).order("starts_at").limit(1),
    admin.from("reward_redemptions").select("id", { count: "exact", head: true }).eq("community_id", communityId).eq("status", "pending"),
    admin.from("member_community_memberships").select("member_id, total_points, is_founder").eq("community_id", communityId).order("total_points", { ascending: false }).limit(5),
    admin.from("member_community_memberships").select("member_id", { count: "exact", head: true }).eq("community_id", communityId).eq("is_founder", true),
  ]);

  // Points + unique active members over 7d, from the community-scoped ledger.
  const ledgerRows = (ledger7.data ?? []) as Array<{ member_id: string; delta: number }>;
  const pointsAwarded7d = ledgerRows.reduce((s, r) => s + Math.max(0, r.delta), 0);
  const activeMembers7d = new Set(ledgerRows.map((r) => r.member_id)).size;

  // Upcoming event RSVP count
  const next = ((nextEvents.data ?? []) as Array<{ id: string; title: string; starts_at: string }>)[0] ?? null;
  let nextEvent: CommunityPulse["nextEvent"] = null;
  let rsvpsUpcoming = 0;
  if (next) {
    const { count } = await admin
      .from("event_rsvps")
      .select("member_id", { count: "exact", head: true })
      .eq("event_id", next.id);
    rsvpsUpcoming = count ?? 0;
    nextEvent = { title: next.title, startsAt: next.starts_at, rsvps: rsvpsUpcoming };
  }

  // Names for top members
  const topRows = (topMemberships.data ?? []) as Array<{
    member_id: string;
    total_points: number;
    is_founder: boolean;
  }>;
  const topIds = topRows.map((r) => r.member_id);
  const { data: topMemberRows } = topIds.length
    ? await admin.from("members").select("id, handle, first_name, last_name").in("id", topIds)
    : { data: [] };
  const nameById = new Map(
    ((topMemberRows ?? []) as Array<{
      id: string;
      handle: string | null;
      first_name: string | null;
      last_name: string | null;
    }>).map((m) => [
      m.id,
      m.handle || [m.first_name, m.last_name].filter(Boolean).join(" ") || null,
    ]),
  );
  const topMembers: TopMember[] = topRows.map((r) => ({
    memberId: r.member_id,
    displayName: nameById.get(r.member_id) ?? null,
    totalPoints: r.total_points,
    isFounder: r.is_founder,
  }));

  // Churn risk: members with meaningful points whose members.last_active_date
  // is 14–60 days old. (Older than 60 = churned, not "at risk".)
  const { data: memberRows } = await admin
    .from("member_community_memberships")
    .select("member_id, total_points")
    .eq("community_id", communityId)
    .gte("total_points", 100)
    .order("total_points", { ascending: false })
    .limit(200);
  const candidates = (memberRows ?? []) as Array<{ member_id: string; total_points: number }>;
  const pointsById = new Map(candidates.map((r) => [r.member_id, r.total_points]));
  const { data: quietRows } = candidates.length
    ? await admin
        .from("members")
        .select("id, handle, first_name, last_name, last_active_date")
        .in("id", candidates.map((r) => r.member_id))
        .not("last_active_date", "is", null)
        .lte("last_active_date", daysAgoIso(14).slice(0, 10))
        .gte("last_active_date", daysAgoIso(60).slice(0, 10))
        .order("last_active_date", { ascending: true })
        .limit(15)
    : { data: [] };
  const today = Date.now();
  const quietMembers: QuietMember[] = ((quietRows ?? []) as Array<{
    id: string;
    handle: string | null;
    first_name: string | null;
    last_name: string | null;
    last_active_date: string | null;
  }>).map((m) => ({
    memberId: m.id,
    displayName:
      m.handle || [m.first_name, m.last_name].filter(Boolean).join(" ") || null,
    totalPoints: pointsById.get(m.id) ?? 0,
    lastActiveDate: m.last_active_date,
    daysQuiet: m.last_active_date
      ? Math.floor((today - new Date(`${m.last_active_date}T00:00:00Z`).getTime()) / 86_400_000)
      : 0,
  }));

  return {
    communityId,
    displayName: (community.data?.display_name as string | undefined) ?? communityId,
    memberCount: members.count ?? 0,
    newMembers7d: new7.count ?? 0,
    newMembers30d: new30.count ?? 0,
    activeMembers7d,
    pointsAwarded7d,
    posts7d: posts7.count ?? 0,
    comments7d: comments7.count ?? 0,
    rsvpsUpcoming,
    nextEvent,
    pendingRedemptions: pendingRedemptions.count ?? 0,
    topMembers,
    quietMembers,
    founderCount: founderCount.count ?? 0,
  };
}
