/**
 * lib/fraud-detection/index.ts (BEP)
 *
 * BEP mirror of FE fraud detection. Same two-stage detector;
 * uses members table + member_id field.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5";

const MAX_CANDIDATES_PER_RUN = 5;

export type Verdict = "legitimate" | "suspicious" | "unclear";

export interface FraudFlag {
  member_id: string;
  triggers: string[];
  verdict: Verdict;
  confidence: number;
  reasons: string[];
  evidence: FraudEvidence;
}

export interface FraudEvidence {
  member_summary: {
    signup_date: string | null;
    total_points: number | null;
    has_interest: boolean;
    days_since_signup: number | null;
  };
  activity_24h: { posts: number; comments: number };
  post_samples: string[];
  comment_samples: string[];
}

interface MemberRow {
  id: string;
  created_at: string | null;
  total_points: number | null;
  interest: string | null;
  first_name: string | null;
}

interface PostRow {
  body: string | null;
  created_at: string;
}

interface CommentRow {
  body: string | null;
  created_at: string;
}

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

export async function gatherCandidates(admin: {
  from: (table: string) => any;
}): Promise<{ member_id: string; triggers: string[] }[]> {
  const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgoIso = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const triggersByMember = new Map<string, Set<string>>();
  const add = (memberId: string, trigger: string) => {
    if (!triggersByMember.has(memberId)) triggersByMember.set(memberId, new Set());
    triggersByMember.get(memberId)!.add(trigger);
  };

  const { data: burstPosts } = await admin
    .from("community_posts")
    .select("author_id")
    .gte("created_at", dayAgoIso);
  if (burstPosts) {
    const counts = new Map<string, number>();
    for (const row of burstPosts) {
      const id = (row as { author_id?: string | null }).author_id;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const [id, count] of counts.entries()) {
      if (count > 5) add(id, "burst_posting");
    }
  }

  const { data: burstComments } = await admin
    .from("community_comments")
    .select("author_id")
    .gte("created_at", dayAgoIso);
  if (burstComments) {
    const counts = new Map<string, number>();
    for (const row of burstComments) {
      const id = (row as { author_id?: string | null }).author_id;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const [id, count] of counts.entries()) {
      if (count > 20) add(id, "burst_commenting");
    }
  }

  const { data: rapidMembers } = await admin
    .from("members")
    .select("id")
    .gte("total_points", 200)
    .gte("created_at", sevenDaysAgoIso);
  if (rapidMembers) {
    for (const row of rapidMembers) {
      const id = (row as { id?: string }).id;
      if (id) add(id, "rapid_points");
    }
  }

  return Array.from(triggersByMember.entries())
    .slice(0, MAX_CANDIDATES_PER_RUN)
    .map(([member_id, triggers]) => ({ member_id, triggers: Array.from(triggers) }));
}

export async function evaluateCandidate(
  admin: { from: (table: string) => any },
  candidate: { member_id: string; triggers: string[] },
): Promise<FraudFlag | null> {
  const memberId = candidate.member_id;
  const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [memberRes, postsRes, commentsRes] = await Promise.all([
    admin
      .from("members")
      .select("id, created_at, total_points, interest, first_name")
      .eq("id", memberId)
      .maybeSingle(),
    admin
      .from("community_posts")
      .select("body, created_at")
      .eq("author_id", memberId)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("community_comments")
      .select("body, created_at")
      .eq("author_id", memberId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const member = memberRes.data as MemberRow | null;
  if (!member) return null;

  const allPosts = (postsRes.data ?? []) as PostRow[];
  const allComments = (commentsRes.data ?? []) as CommentRow[];

  const posts24h = allPosts.filter((p) => p.created_at >= dayAgoIso).length;
  const comments24h = allComments.filter(
    (c) => c.created_at >= dayAgoIso,
  ).length;

  const daysSinceSignup = member.created_at
    ? Math.max(
        0,
        (Date.now() - new Date(member.created_at).getTime()) / 86_400_000,
      )
    : null;

  const evidence: FraudEvidence = {
    member_summary: {
      signup_date: member.created_at,
      total_points: member.total_points,
      has_interest:
        typeof member.interest === "string" && member.interest.trim().length > 0,
      days_since_signup: daysSinceSignup
        ? Math.round(daysSinceSignup * 10) / 10
        : null,
    },
    activity_24h: { posts: posts24h, comments: comments24h },
    post_samples: allPosts
      .slice(0, 5)
      .map((p) => (p.body ?? "").trim())
      .filter((b) => b.length > 0),
    comment_samples: allComments
      .slice(0, 10)
      .map((c) => (c.body ?? "").trim())
      .filter((b) => b.length > 0),
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      member_id: memberId,
      triggers: candidate.triggers,
      verdict: "unclear",
      confidence: 0.3,
      reasons: ["ANTHROPIC_API_KEY not set; cannot evaluate"],
      evidence,
    };
  }

  const userPrompt = buildPrompt(candidate.triggers, evidence);
  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0.1,
      }),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let json: AnthropicMessageResponse;
  try {
    json = (await response.json()) as AnthropicMessageResponse;
  } catch {
    return null;
  }

  const text = (json.content.find((c) => c.type === "text")?.text ?? "").trim();
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }

  const validated = validateVerdict(parsed);
  if (!validated) return null;

  return {
    member_id: memberId,
    triggers: candidate.triggers,
    verdict: validated.verdict,
    confidence: validated.confidence,
    reasons: validated.reasons,
    evidence,
  };
}

function validateVerdict(
  raw: unknown,
): { verdict: Verdict; confidence: number; reasons: string[] } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const verdict =
    r.verdict === "suspicious" || r.verdict === "unclear"
      ? r.verdict
      : "legitimate";
  const confidence =
    typeof r.confidence === "number" && r.confidence >= 0 && r.confidence <= 1
      ? Math.round(r.confidence * 100) / 100
      : 0.5;
  const reasons = Array.isArray(r.reasons)
    ? r.reasons
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 6)
    : [];
  return { verdict: verdict as Verdict, confidence, reasons };
}

function buildPrompt(triggers: string[], evidence: FraudEvidence): string {
  const e = evidence;
  const parts: string[] = [];
  parts.push(`HEURISTICS THAT TRIGGERED: ${triggers.join(", ")}`);
  parts.push("");
  parts.push("MEMBER PROFILE:");
  parts.push(
    `  signup: ${e.member_summary.signup_date ?? "?"} (${e.member_summary.days_since_signup ?? "?"} days ago)`,
  );
  parts.push(`  total_points: ${e.member_summary.total_points ?? 0}`);
  parts.push(`  has_interest_filled: ${e.member_summary.has_interest}`);
  parts.push("");
  parts.push("ACTIVITY (last 24 hours):");
  parts.push(`  posts: ${e.activity_24h.posts}`);
  parts.push(`  comments: ${e.activity_24h.comments}`);
  parts.push("");
  if (e.post_samples.length > 0) {
    parts.push("RECENT POST BODIES (first 5):");
    e.post_samples.forEach((b, i) => {
      parts.push(`  ${i + 1}. ${truncate(b, 200)}`);
    });
    parts.push("");
  }
  if (e.comment_samples.length > 0) {
    parts.push("RECENT COMMENT BODIES (first 10):");
    e.comment_samples.forEach((b, i) => {
      parts.push(`  ${i + 1}. ${truncate(b, 100)}`);
    });
    parts.push("");
  }
  parts.push(
    `Return JSON ONLY:
{
  "verdict": "legitimate" | "suspicious" | "unclear",
  "confidence": 0..1,
  "reasons": ["specific reason 1", "specific reason 2", ...]
}`,
  );
  return parts.join("\n");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

const SYSTEM_PROMPT = `You're a fraud analyst for a brand-community platform. The platform pays members points for community engagement (posts, comments, polls). Some members may try to farm points or create sock-puppet accounts.

Your job: review the activity below and decide if this looks legitimate, suspicious, or unclear.

LEAN STRONGLY TOWARD "legitimate" UNLESS YOU SEE CLEAR SIGNS OF ABUSE.

Signs that suggest LEGITIMATE behavior (favor these):
  * Posts/comments engage genuinely with the brand or other members
  * Variety in tone, length, and topic
  * Comments respond to specific content (not generic praise)
  * Profile partially filled in (interest, etc.)

Signs that suggest SUSPICIOUS behavior:
  * Identical or near-duplicate post/comment bodies
  * LLM-generated text patterns (overly polished, generic, no specifics)
  * Comments are all on the member's own posts (self-engagement)
  * Generic single-word or single-emoji comments at high volume
  * High activity but no replies to others
  * Signed up <7 days ago AND already gained 200+ points without genuine interaction

Use "unclear" for genuinely ambiguous cases (sparse data, etc.).

Confidence calibration:
  * 0.9+: very confident
  * 0.6-0.8: likely but room for doubt
  * <0.6: just a hunch — usually report as "unclear" instead

Output JSON only — no commentary, no markdown fences.`;

export async function scanForFraud(admin: {
  from: (table: string) => any;
}): Promise<FraudFlag[]> {
  const candidates = await gatherCandidates(admin);
  const results: FraudFlag[] = [];
  for (const c of candidates) {
    const r = await evaluateCandidate(admin, c);
    if (r) results.push(r);
  }
  return results;
}
