import type { PolicyPage } from "@/lib/data/policies";

/**
 * A database policy is "published" only when it is not a draft and its
 * opening is not the seeded placeholder. Otherwise the repo copy is shown.
 */
const PLACEHOLDER_RE = /DRAFT|placeholder/i;

export function isPublishedPolicyContent(content: string, isDraft: boolean): boolean {
  if (isDraft) return false;
  const head = content.trim().slice(0, 500);
  if (!head) return false;
  if (PLACEHOLDER_RE.test(head)) return false;
  return true;
}

export type PolicyDisplayOptions = {
  /**
   * A published database row whose updated_at is strictly before this
   * instant is ignored, and the repo copy is shown. A later save in
   * /admin/policies sets updated_at and then wins. No SQL.
   * Date.parse is used so both Z and numeric-offset timestamps compare.
   */
  replaceDbUpdatedBefore?: string;
};

function dbRowIsOlderThan(updatedAt: string, cutoff: string): boolean {
  const rowMs = Date.parse(updatedAt);
  const cutoffMs = Date.parse(cutoff);
  if (Number.isNaN(rowMs) || Number.isNaN(cutoffMs)) return false;
  return rowMs < cutoffMs;
}

export function policyForDisplay(
  row: PolicyPage | null,
  fallback: PolicyPage,
  options?: PolicyDisplayOptions,
): PolicyPage {
  if (row && isPublishedPolicyContent(row.content_md, row.is_draft)) {
    if (
      options?.replaceDbUpdatedBefore &&
      dbRowIsOlderThan(row.updated_at, options.replaceDbUpdatedBefore)
    ) {
      return fallback;
    }
    return row;
  }
  return fallback;
}
