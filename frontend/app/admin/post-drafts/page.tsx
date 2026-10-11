/**
 * /admin/post-drafts (BEP)
 *
 * AI #18: AI-drafted brand community posts queued for admin review.
 */

import { notFound, redirect } from "next/navigation";
import { isAiFeatureOn } from "@/lib/ai-features";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessBrand, getAdminContext } from "@/lib/admin";
import {
  generateAction,
  publishAction,
  discardAction,
} from "./actions";

export const dynamic = "force-dynamic";

interface DraftRow {
  id: string;
  kind: string;
  suggested_title: string | null;
  suggested_body: string;
  context_summary: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
}

export default async function AdminPostDraftsPage() {
  if (!isAiFeatureOn("postDrafts")) notFound();
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");
  const brandSlug = ctx.currentCommunityId ?? "";
  if (!brandSlug || !canAccessBrand(ctx, brandSlug)) redirect("/admin");

  const admin = createAdminClient();
  const { data: pending } = await admin
    .from("brand_post_drafts")
    .select(
      "id, kind, suggested_title, suggested_body, context_summary, status, created_at, reviewed_at",
    )
    .eq("brand_slug", brandSlug)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: history } = await admin
    .from("brand_post_drafts")
    .select(
      "id, kind, suggested_title, suggested_body, context_summary, status, created_at, reviewed_at",
    )
    .eq("brand_slug", brandSlug)
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);

  const pendingDrafts = (pending ?? []) as DraftRow[];
  const pastDrafts = (history ?? []) as DraftRow[];

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-iron/70">
          Admin · Post drafts
        </p>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Auto-generated post drafts
        </h1>
        <p className="max-w-2xl text-sm text-iron/70">
          Click <span className="font-semibold">Generate draft</span> and
          AI will write a candidate community post using only real data
          (your upcoming events, recent admin posts, member comments).
          Review, edit, and publish — or discard and try again.
        </p>
      </header>

      <section>
        <form action={generateAction}>
          <button
            type="submit"
            className="rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-linen shadow-glass hover:brightness-110"
          >
            ✨ Generate a new draft
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Pending review ({pendingDrafts.length})
        </h2>
        {pendingDrafts.length === 0 ? (
          <p className="rounded-lg border border-iron/10 bg-parchment/30 p-6 text-sm text-iron/70">
            No pending drafts. Click &ldquo;Generate a new draft&rdquo;
            above to create one.
          </p>
        ) : (
          <ul className="space-y-3">
            {pendingDrafts.map((d) => (
              <PendingDraftCard key={d.id} draft={d} />
            ))}
          </ul>
        )}
      </section>

      {pastDrafts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-iron/80">
            Recent history
          </h2>
          <ul className="space-y-2">
            {pastDrafts.map((d) => (
              <li
                key={d.id}
                className="rounded-lg border border-iron/10 bg-parchment/30 p-4 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 uppercase tracking-wide ${
                      d.status === "published"
                        ? "border-emerald-300/30 bg-emerald-300/10 text-sage-ink"
                        : "border-iron/15 bg-iron/5 text-iron/70"
                    }`}
                  >
                    {d.status}
                  </span>
                  <span className="text-iron/70">
                    {d.reviewed_at
                      ? new Date(d.reviewed_at).toLocaleString()
                      : new Date(d.created_at).toLocaleString()}
                  </span>
                </div>
                {d.suggested_title && (
                  <p className="mt-2 text-sm font-semibold text-iron/80">
                    {d.suggested_title}
                  </p>
                )}
                <p className="mt-1 text-iron/70 line-clamp-2">
                  {d.suggested_body.length > 200
                    ? d.suggested_body.slice(0, 200) + "…"
                    : d.suggested_body}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function PendingDraftCard({ draft }: { draft: DraftRow }) {
  return (
    <li className="glass-card p-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-aurora/30 bg-aurora/10 px-2 py-0.5 uppercase tracking-wide text-aurora-ink">
            {draft.kind === "announcement" ? "📢 Announcement" : "Post"}
          </span>
          <span className="text-iron/70">
            Drafted {new Date(draft.created_at).toLocaleString()}
          </span>
        </div>

        {draft.context_summary && (
          <p className="rounded-xl border border-iron/10 bg-parchment/30 p-3 text-xs text-iron/70">
            <span className="text-iron/70">Based on: </span>
            {draft.context_summary}
          </p>
        )}

        <form action={publishAction} className="space-y-3">
          <input type="hidden" name="draft_id" value={draft.id} />

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-iron/70">
              Title (optional)
            </label>
            <input
              type="text"
              name="edited_title"
              defaultValue={draft.suggested_title ?? ""}
              maxLength={200}
              placeholder="(no title)"
              className="w-full rounded-xl border border-iron/10 bg-parchment/40 px-3 py-2 text-sm placeholder-iron/40 focus:border-aurora/40 outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-iron/70">
              Body
            </label>
            <textarea
              name="edited_body"
              defaultValue={draft.suggested_body}
              rows={6}
              maxLength={2000}
              className="w-full rounded-xl border border-iron/10 bg-parchment/40 px-3 py-2 text-sm focus:border-aurora/40 outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-full bg-ember px-5 py-2 text-xs font-semibold text-linen shadow-glass hover:brightness-110"
            >
              Publish to community
            </button>
          </div>
        </form>

        <form action={discardAction}>
          <input type="hidden" name="draft_id" value={draft.id} />
          <button
            type="submit"
            className="rounded-full border border-iron/15 bg-iron/5 px-4 py-1.5 text-xs text-iron/70 hover:bg-iron/10"
          >
            Discard
          </button>
        </form>
      </div>
    </li>
  );
}
