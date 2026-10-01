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

export function policyForDisplay(
  row: PolicyPage | null,
  fallback: PolicyPage,
): PolicyPage {
  if (row && isPublishedPolicyContent(row.content_md, row.is_draft)) return row;
  return fallback;
}
