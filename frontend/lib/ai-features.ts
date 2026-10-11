/**
 * AI helper on/off switches (item 12). Pure module, no imports, so it can be
 * unit tested and read from pages, API routes, crons and client components.
 *
 * A helper is ON only when production shows it doing its job. Everything
 * else stays OFF (hidden in the UI, 404 from its API route, cron skipped)
 * until it is tested end to end. Flip a switch here to turn one back on.
 *
 * Evidence as of 2026-10-11 (BEP prod):
 *   dailyAdminBrief  ON   admin_briefs written daily (164 rows, latest 10-10)
 *   moderation       ON   moderation_decisions written by the backfill cron
 *   embeddings       ON   content_embeddings written (search)
 *   altText          ON   both image posts got image_alt
 *   threadSummary    ON   shows only when a summary exists, so it hides itself
 *   copilot          OFF  one brief ever (2026-07-05)
 *   fraudScan        OFF  zero fraud_signals ever, model errors were silent
 *   postDrafts       OFF  last draft 2026-05-05, page not linked anywhere
 *   draftReply       OFF  no calls in prod logs
 *   tagSuggester     OFF  no post has ever been tagged
 *   predictionIdeas  OFF  no calls in prod logs, failures are silent
 *   captionSuggester OFF  route had a broken URL check, no UI uses it
 */

export const AI_FEATURES = {
  dailyAdminBrief: true,
  moderation: true,
  embeddings: true,
  altText: true,
  threadSummary: true,
  copilot: false,
  fraudScan: false,
  postDrafts: false,
  draftReply: false,
  tagSuggester: false,
  predictionIdeas: false,
  captionSuggester: false,
} as const;

export type AiFeature = keyof typeof AI_FEATURES;

export function isAiFeatureOn(
  feature: AiFeature,
  flags: Readonly<Record<AiFeature, boolean>> = AI_FEATURES,
): boolean {
  return flags[feature] === true;
}

/** Admin nav links that belong to an AI feature. */
const NAV_FEATURE: Readonly<Record<string, AiFeature>> = {
  "/admin/copilot": "copilot",
  "/admin/fraud-signals": "fraudScan",
  "/admin/post-drafts": "postDrafts",
};

/** Drop nav links whose AI feature is off. Other links pass through. */
export function visibleAdminNav<T extends { href: string }>(
  items: readonly T[],
  flags: Readonly<Record<AiFeature, boolean>> = AI_FEATURES,
): T[] {
  return items.filter((item) => {
    const feature = NAV_FEATURE[item.href];
    return !feature || isAiFeatureOn(feature, flags);
  });
}

/** Body a cron returns when its feature is off. */
export function disabledCronBody(feature: AiFeature) {
  return { ok: true, skipped: "disabled", feature } as const;
}
