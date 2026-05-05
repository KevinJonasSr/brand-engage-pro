import { createAdminClient } from "@/lib/supabase/admin";
import { gatherPredictionTally } from "@/lib/predictions/tally";
import {
  predictionPhase,
  formatPredictionCountdown,
  secondsUntilPredictionClose,
} from "@/lib/predictions/types";
import type {
  AwardStrategy,
  PollOption,
  PollVote,
  PredictionType,
  PredictionVisibility,
} from "@/lib/predictions/types";
import { PredictionVoteForm } from "./prediction-vote-form";
import { PredictionTallyView } from "./prediction-tally-view";

interface PostFields {
  id: string;
  brand_slug: string;
  title: string;
  body: string | null;
  prediction_type: PredictionType | null;
  prediction_closes_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  points_for_correct: number | null;
  visibility: PredictionVisibility;
  numeric_unit: string | null;
  award_strategy: AwardStrategy | null;
  correct_option_id: string | null;
  correct_numeric_value: number | null;
  correct_date_value: string | null;
  show_live_tally: boolean | null;
  allow_vote_changes: boolean | null;
  created_at: string;
}

interface Props {
  postId: string;
  viewerMemberId: string | null;
  viewerTier?: PredictionVisibility;
  /** When true, link the title to /admin/predictions/[id] instead of inline. */
  adminLink?: boolean;
}

const TIER_RANK: Record<PredictionVisibility, number> = {
  public: 0,
  premium: 1,
  "founder-only": 2,
};

/**
 * Server component. Fetches the prediction + options + viewer's vote +
 * tally (when appropriate) and renders the right state for this viewer.
 *
 * Returns null if visibility gates the viewer out.
 */
export async function PredictionCard({
  postId,
  viewerMemberId,
  viewerTier = "public",
  adminLink = false,
}: Props) {
  const admin = createAdminClient();

  const { data: postRaw } = await admin
    .from("community_posts")
    .select(
      "id, brand_slug, title, body, prediction_type, prediction_closes_at, " +
        "resolved_at, resolution_note, points_for_correct, visibility, " +
        "numeric_unit, award_strategy, correct_option_id, " +
        "correct_numeric_value, correct_date_value, show_live_tally, " +
        "allow_vote_changes, created_at",
    )
    .eq("id", postId)
    .eq("kind", "prediction")
    .maybeSingle();

  if (!postRaw) return null;
  const post = postRaw as unknown as PostFields;

  // Visibility gate
  if (TIER_RANK[post.visibility] > TIER_RANK[viewerTier]) return null;

  // Options for multi
  let options: PollOption[] = [];
  if (post.prediction_type === "multi") {
    const { data: optRows } = await admin
      .from("community_poll_options")
      .select("id, post_id, label, sort_order")
      .eq("post_id", postId)
      .order("sort_order");
    options = (optRows ?? []) as unknown as PollOption[];
  }

  // Viewer's vote
  let viewerVote: PollVote | null = null;
  if (viewerMemberId) {
    const { data: voteRow } = await admin
      .from("community_poll_votes")
      .select(
        "id, post_id, member_id, option_id, numeric_value, date_value, created_at",
      )
      .eq("post_id", postId)
      .eq("member_id", viewerMemberId)
      .maybeSingle();
    viewerVote = voteRow ? (voteRow as unknown as PollVote) : null;
  }

  const phase = predictionPhase({
    prediction_closes_at: post.prediction_closes_at,
    resolved_at: post.resolved_at,
  });
  const secsLeft = secondsUntilPredictionClose({
    prediction_closes_at: post.prediction_closes_at,
  });

  // Tally is shown when:
  //  - admin set show_live_tally=true, OR
  //  - viewer has voted, OR
  //  - prediction is closed/resolved
  const shouldShowTally =
    !!post.show_live_tally || !!viewerVote || phase !== "open";
  const tally = shouldShowTally ? await gatherPredictionTally(postId) : null;

  // Comment count
  const { count: commentCount } = await admin
    .from("community_comments")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);

  const isWinner = (() => {
    if (!post.resolved_at || !viewerVote) return false;
    if (post.prediction_type === "multi")
      return viewerVote.option_id === post.correct_option_id;
    if (post.prediction_type === "numeric") {
      // For numeric we'd need to recompute the winner set; skip the badge if
      // there's any ambiguity. We can show a simpler "you got it" badge only
      // for an exact match.
      return (
        viewerVote.numeric_value != null &&
        post.correct_numeric_value != null &&
        viewerVote.numeric_value === post.correct_numeric_value
      );
    }
    if (post.prediction_type === "date") {
      return viewerVote.date_value === post.correct_date_value;
    }
    return false;
  })();

  return (
    <article
      id={`prediction-${postId}`}
      className="glass-card rounded-2xl p-5"
    >
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className="rounded-full bg-aurora/30 px-2 py-1 font-medium text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Prediction
            </span>
            <span className="rounded-full bg-white/5 px-2 py-1 text-white/65">
              {labelType(post.prediction_type)}
            </span>
            {phase === "open" && secsLeft !== null && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-300">
                Closes in {formatPredictionCountdown(secsLeft)}
              </span>
            )}
            {phase === "closed" && (
              <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-300">
                Voting closed
              </span>
            )}
            {phase === "resolved" && (
              <span className="rounded-full bg-white/10 px-2 py-1 text-white/65">
                Resolved
              </span>
            )}
            {phase === "resolved" && isWinner && (
              <span className="rounded-full bg-emerald-500/25 px-2 py-1 font-semibold text-emerald-200">
                🎉 You called it!
              </span>
            )}
            {(post.points_for_correct ?? 0) > 0 && (
              <span className="rounded-full bg-white/5 px-2 py-1 text-white/65">
                {post.points_for_correct} pts
              </span>
            )}
          </div>
          <h3
            className="mt-2 text-lg font-semibold leading-snug text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {adminLink ? (
              <a
                href={`/admin/predictions/${post.id}`}
                className="hover:underline"
              >
                {post.title}
              </a>
            ) : (
              post.title
            )}
          </h3>
          {post.body && (
            <p className="mt-1 text-sm text-white/75">{post.body}</p>
          )}
        </div>
      </header>

      {/* Body — vote form OR tally OR resolution */}
      <div className="mt-4">
        {phase === "resolved" ? (
          <ResolvedView
            post={post}
            options={options}
            tally={tally}
            isWinner={isWinner}
            viewerVoted={!!viewerVote}
          />
        ) : phase === "open" ? (
          <OpenView
            post={post}
            options={options}
            viewerMemberId={viewerMemberId}
            viewerVote={viewerVote}
            tally={tally}
          />
        ) : (
          /* closed, awaiting resolution */
          <ClosedView post={post} options={options} tally={tally} viewerVote={viewerVote} />
        )}
      </div>

      {/* Footer */}
      <footer className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-xs text-white/55">
        <span>
          {commentCount ?? 0} comment{commentCount === 1 ? "" : "s"}
        </span>
        <a
          href={`/brands/${post.brand_slug}/community#post-${post.id}`}
          className="text-white/65 hover:text-white"
        >
          Discuss →
        </a>
      </footer>
    </article>
  );
}

function labelType(t: PredictionType | null): string {
  if (t === "multi") return "Multiple choice";
  if (t === "numeric") return "Numeric guess";
  if (t === "date") return "Date guess";
  return "—";
}

/* ──────────────────────────── Open phase ─────────────────────────── */

function OpenView({
  post,
  options,
  viewerMemberId,
  viewerVote,
  tally,
}: {
  post: PostFields;
  options: PollOption[];
  viewerMemberId: string | null;
  viewerVote: PollVote | null;
  tally: Awaited<ReturnType<typeof gatherPredictionTally>>;
}) {
  if (!viewerMemberId) {
    return (
      <p className="text-sm text-white/65">
        <a
          href={`/login?redirect=/brands/${post.brand_slug}#prediction-${post.id}`}
          className="font-medium text-white underline"
        >
          Sign in
        </a>{" "}
        to vote.
      </p>
    );
  }

  // If the viewer has already voted AND vote changes are NOT allowed, show
  // the locked tally view.
  if (viewerVote && !post.allow_vote_changes) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-300">
          ✓ You voted — locked until results.
        </p>
        {post.show_live_tally && tally && (
          <PredictionTallyView
            type={post.prediction_type ?? "multi"}
            tally={tally}
            options={options}
            highlightOptionId={viewerVote.option_id}
          />
        )}
      </div>
    );
  }

  // Voting form (also re-opens for vote-changes-allowed members who already voted)
  return (
    <div className="space-y-3">
      <PredictionVoteForm
        postId={post.id}
        predictionType={post.prediction_type ?? "multi"}
        options={options}
        numericUnit={post.numeric_unit}
        currentVote={viewerVote}
      />
      {post.show_live_tally && tally && tally.total_votes > 0 && (
        <details className="rounded-lg border border-white/10 bg-white/3 p-3 text-sm text-white/75">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-white/55">
            See live tally · {tally.total_votes} vote{tally.total_votes === 1 ? "" : "s"}
          </summary>
          <div className="mt-3">
            <PredictionTallyView
              type={post.prediction_type ?? "multi"}
              tally={tally}
              options={options}
              highlightOptionId={viewerVote?.option_id ?? null}
            />
          </div>
        </details>
      )}
    </div>
  );
}

/* ──────────────────────────── Closed phase ─────────────────────── */

function ClosedView({
  post,
  options,
  tally,
  viewerVote,
}: {
  post: PostFields;
  options: PollOption[];
  tally: Awaited<ReturnType<typeof gatherPredictionTally>>;
  viewerVote: PollVote | null;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-white/75">
        Voting closed. Awaiting the official answer.
      </p>
      {tally && tally.total_votes > 0 && (
        <PredictionTallyView
          type={post.prediction_type ?? "multi"}
          tally={tally}
          options={options}
          highlightOptionId={viewerVote?.option_id ?? null}
        />
      )}
    </div>
  );
}

/* ──────────────────────────── Resolved phase ─────────────────────── */

function ResolvedView({
  post,
  options,
  tally,
  isWinner,
  viewerVoted,
}: {
  post: PostFields;
  options: PollOption[];
  tally: Awaited<ReturnType<typeof gatherPredictionTally>>;
  isWinner: boolean;
  viewerVoted: boolean;
}) {
  const correctLabel = (() => {
    if (post.prediction_type === "multi") {
      const opt = options.find((o) => o.id === post.correct_option_id);
      return opt?.label ?? "—";
    }
    if (post.prediction_type === "numeric") {
      return `${post.correct_numeric_value ?? "—"}${
        post.numeric_unit ? ` ${post.numeric_unit}` : ""
      }`;
    }
    if (post.prediction_type === "date") {
      return post.correct_date_value ?? "—";
    }
    return "—";
  })();

  return (
    <div className="space-y-3">
      {viewerVoted && isWinner && (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          🎉 You called it — points are in your wallet.
        </div>
      )}
      {viewerVoted && !isWinner && (
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75">
          Better luck next time.
        </div>
      )}
      <p className="text-sm text-white/85">
        <span className="font-semibold text-white">Correct answer:</span>{" "}
        {correctLabel}
      </p>
      {post.resolution_note && (
        <p className="text-sm text-white/65">{post.resolution_note}</p>
      )}
      {tally && tally.total_votes > 0 && (
        <details className="rounded-lg border border-white/10 bg-white/3 p-3 text-sm text-white/75">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-white/55">
            How everyone voted · {tally.total_votes} vote
            {tally.total_votes === 1 ? "" : "s"}
          </summary>
          <div className="mt-3">
            <PredictionTallyView
              type={post.prediction_type ?? "multi"}
              tally={tally}
              options={options}
              highlightOptionId={post.correct_option_id}
            />
          </div>
        </details>
      )}
    </div>
  );
}
