/**
 * AI #16: Evaluate a SegmentFilter against the members table for a
 * given brand. Wraps the evaluate_audience_segment Postgres RPC.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { SegmentFilter, SegmentMatch } from "./types";

export async function evaluateSegment(
  filter: SegmentFilter,
  brandSlug: string,
  limit = 1000,
): Promise<SegmentMatch[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("evaluate_audience_segment", {
    p_filter: filter as unknown as Record<string, unknown>,
    p_brand_slug: brandSlug,
    p_limit: limit,
  });
  if (error) {
    console.warn("[segments] evaluate_audience_segment failed:", error.message);
    return [];
  }
  return (data ?? []) as SegmentMatch[];
}
