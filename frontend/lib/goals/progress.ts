import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Brand goals — data-driven community goals with live progress.
 *
 * A goal is a target number over one of three metrics:
 *   ledger_count — count of points_ledger rows with source = metric_ref
 *                  (e.g. 500 check-ins, 250 referrals) inside the window
 *   member_count — total members in the community (window ignored; the
 *                  goal is the community's size itself)
 *   points_sum   — sum of positive ledger deltas in the window, optionally
 *                  restricted to source = metric_ref
 */

export interface BrandGoal {
  id: string;
  community_id: string;
  title: string;
  description: string | null;
  metric: "ledger_count" | "member_count" | "points_sum";
  metric_ref: string | null;
  target: number;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  created_at: string;
}

export interface GoalProgress extends BrandGoal {
  current: number;
  pct: number; // 0-100, capped
  completed: boolean;
}

export async function computeGoalProgress(goal: BrandGoal): Promise<GoalProgress> {
  const admin = createAdminClient();
  let current = 0;

  try {
    if (goal.metric === "member_count") {
      const { count } = await admin
        .from("member_community_memberships")
        .select("member_id", { count: "exact", head: true })
        .eq("community_id", goal.community_id);
      current = count ?? 0;
    } else if (goal.metric === "ledger_count") {
      let q = admin
        .from("points_ledger")
        .select("id", { count: "exact", head: true })
        .eq("community_id", goal.community_id)
        .gte("created_at", goal.starts_at);
      if (goal.metric_ref) q = q.eq("source", goal.metric_ref);
      if (goal.ends_at) q = q.lte("created_at", goal.ends_at);
      const { count } = await q;
      current = count ?? 0;
    } else {
      let q = admin
        .from("points_ledger")
        .select("delta")
        .eq("community_id", goal.community_id)
        .gte("created_at", goal.starts_at)
        .gt("delta", 0);
      if (goal.metric_ref) q = q.eq("source", goal.metric_ref);
      if (goal.ends_at) q = q.lte("created_at", goal.ends_at);
      const { data } = await q;
      current = ((data ?? []) as Array<{ delta: number }>).reduce(
        (s, r) => s + r.delta,
        0,
      );
    }
  } catch (err) {
    console.warn("computeGoalProgress failed:", err);
  }

  const pct = Math.min(100, Math.round((current / goal.target) * 100));
  return { ...goal, current, pct, completed: current >= goal.target };
}

/** Active goals for a community, with progress. Never throws. */
export async function getActiveGoalsWithProgress(
  communityId: string,
  limit = 3,
): Promise<GoalProgress[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("brand_goals")
      .select("*")
      .eq("community_id", communityId)
      .eq("active", true)
      .order("starts_at", { ascending: false })
      .limit(limit);
    const goals = (data ?? []) as BrandGoal[];
    return await Promise.all(goals.map(computeGoalProgress));
  } catch (err) {
    console.warn("getActiveGoalsWithProgress failed:", err);
    return [];
  }
}

export async function getGoalWithProgress(
  goalId: string,
): Promise<GoalProgress | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("brand_goals")
      .select("*")
      .eq("id", goalId)
      .maybeSingle();
    if (!data) return null;
    return await computeGoalProgress(data as BrandGoal);
  } catch {
    return null;
  }
}
