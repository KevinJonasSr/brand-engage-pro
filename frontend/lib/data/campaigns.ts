import { createClient } from "@/lib/supabase/server";

export interface MemberActionRow {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  url: string | null;
  cta_label: string;
  point_value: number;
  completed: boolean;
}

/**
 * Returns active member_actions for an brand plus whether the current member has
 * already completed each one. Safe for signed-out callers (returns
 * completed=false for everything).
 */
export async function getActiveMemberActionsForBrand(
  brandSlug: string,
): Promise<MemberActionRow[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: actions, error } = await supabase
      .from("member_actions")
      .select("id,kind,title,description,url,cta_label,point_value")
      .eq("brand_slug", brandSlug)
      .eq("active", true)
      .order("sort_order");
    if (error) throw error;
    if (!actions || actions.length === 0) return [];

    let completedSet = new Set<string>();
    if (user) {
      const { data: done } = await supabase
        .from("member_action_completions")
        .select("action_id")
        .eq("member_id", user.id)
        .in(
          "action_id",
          actions.map((a) => a.id as string),
        );
      completedSet = new Set((done ?? []).map((d) => d.action_id as string));
    }

    return actions.map(
      (a) =>
        ({
          id: a.id as string,
          kind: a.kind as string,
          title: a.title as string,
          description: (a.description as string | null) ?? null,
          url: (a.url as string | null) ?? null,
          cta_label: a.cta_label as string,
          point_value: a.point_value as number,
          completed: completedSet.has(a.id as string),
        }) as MemberActionRow,
    );
  } catch {
    return [];
  }
}
