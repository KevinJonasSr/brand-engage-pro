/**
 * Who may send a text or email blast. Brand owners only.
 * Super-admins hold a '*' grant and can administer every brand, so they
 * can send too. Admin, editor and viewer cannot, including a read-only viewer.
 */

const ROLE_WEIGHT: Record<string, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
};

export function canSendBlasts(
  ctx: { isSuperAdmin?: boolean; role?: string | null } | null | undefined,
): boolean {
  if (!ctx) return false;
  if (ctx.isSuperAdmin) return true;
  return (ROLE_WEIGHT[ctx.role ?? ""] ?? 0) >= ROLE_WEIGHT.owner;
}
