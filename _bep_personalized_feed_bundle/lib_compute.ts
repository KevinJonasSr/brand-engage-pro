/**
 * lib/personal-feed/compute.ts (BEP)
 *
 * Picks 3 community posts to surface to a specific member, based on
 * tag match + recency. No external API calls.
 */

import { createAdminClient } from "@/lib/supabase/admin";

const LOOKBACK_DAYS = 60;
const CANDIDATE_LIMIT = 60;

export interface PickedPost {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  image_url: string | null;
  image_alt: string | null;
  tags: string[] | null;
  created_at: string;
  reason: "tag-match" | "recent" | "fallback";
}

interface CandidateRow {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  image_url: string | null;
  image_alt: string | null;
  tags: string[] | null;
  created_at: string;
  author_id: string;
}

export async function getPickedForYou(args: {
  memberId: string;
  brandSlug: string;
  limit?: number;
}): Promise<PickedPost[]> {
  const limit = args.limit ?? 3;
  const admin = createAdminClient();
  const cutoffIso = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [memberRes, commentsRes] = await Promise.all([
    admin.from("members").select("interest").eq("id", args.memberId).maybeSingle(),
    admin
      .from("community_comments")
      .select("post_id")
      .eq("author_id", args.memberId),
  ]);

  const interest =
    (memberRes.data as { interest?: string | null } | null)?.interest ?? "";
  const interestTokens = tokenize(interest);
  const commentedPostIds = new Set<string>(
    (commentsRes.data ?? [])
      .map((r) => (r as { post_id?: string | null }).post_id)
      .filter((id): id is string => typeof id === "string"),
  );

  const { data: candidatesData } = await admin
    .from("community_posts")
    .select(
      "id, kind, title, body, image_url, image_alt, tags, created_at, author_id",
    )
    .eq("brand_slug", args.brandSlug)
    .eq("moderation_status", "safe")
    .eq("visibility", "public")
    .neq("author_id", args.memberId)
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  const candidates = (candidatesData ?? []) as CandidateRow[];
  const eligible = candidates.filter((c) => !commentedPostIds.has(c.id));
  if (eligible.length === 0) return [];

  const now = Date.now();
  const scored = eligible.map((c) => {
    const tags = (c.tags ?? []).map((t) => t.toLowerCase());
    let tagMatchCount = 0;
    if (interestTokens.length > 0) {
      for (const tok of interestTokens) {
        for (const tag of tags) {
          if (tag.includes(tok) || tok.includes(tag)) {
            tagMatchCount += 1;
            break;
          }
        }
      }
    }
    const ageMs = now - new Date(c.created_at).getTime();
    const ageDays = ageMs / 86_400_000;
    const recencyScore = Math.max(0, 1 - ageDays / LOOKBACK_DAYS);

    const score = tagMatchCount * 2 + recencyScore;
    const reason: PickedPost["reason"] =
      tagMatchCount > 0 ? "tag-match" : "recent";

    return { ...c, _score: score, _reason: reason };
  });

  scored.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const top = scored.slice(0, limit);
  const allZeroScore = top.every((p) => p._score === 0);
  return top.map((p) => ({
    id: p.id,
    kind: p.kind,
    title: p.title,
    body: p.body,
    image_url: p.image_url,
    image_alt: p.image_alt,
    tags: p.tags,
    created_at: p.created_at,
    reason: allZeroScore ? "fallback" : p._reason,
  }));
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[\s,;/]+/)
    .map((t) => t.trim().replace(/[^a-z0-9-]/g, ""))
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

const STOP_WORDS = new Set([
  "the", "and", "a", "of", "to", "in", "for", "on", "with", "is",
  "that", "this", "i", "my", "love", "like", "really", "very",
  "brand", "brands", "product", "products", // too generic for this domain
]);
