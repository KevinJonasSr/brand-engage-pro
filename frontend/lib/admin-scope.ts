/**
 * Pure admin scoping helpers. No Next.js or Supabase imports, so these run
 * under `node --test` and can be shared by server actions, pages and routes.
 *
 * Rules:
 * - Super-admins (a '*' grant in admin_users) may act on any brand.
 * - Every other admin may act only on the brands in `communities`, and a
 *   write always lands on their current brand.
 * - In this app a brand slug and a community id are the same value.
 */

export const ADMIN_FORBIDDEN = "Forbidden";

/** The subset of AdminContext these helpers need. */
export interface AdminScopeContext {
  isSuperAdmin: boolean;
  communities: string[];
  currentCommunityId: string | null;
}

export class AdminScopeError extends Error {
  constructor(message: string = ADMIN_FORBIDDEN) {
    super(message);
    this.name = "AdminScopeError";
  }
}

const clean = (value: string | null | undefined): string =>
  (value ?? "").trim();

/** True when the admin may read or write rows for `brandSlug`. */
export function canAccessBrand(
  ctx: AdminScopeContext | null | undefined,
  brandSlug: string | null | undefined,
): boolean {
  if (!ctx) return false;
  const slug = clean(brandSlug);
  if (!slug) return false;
  if (ctx.isSuperAdmin) return true;
  return ctx.communities.includes(slug);
}

/** Throws AdminScopeError unless the admin may act on `brandSlug`. */
export function requireBrandAccess(
  ctx: AdminScopeContext | null | undefined,
  brandSlug: string | null | undefined,
): string {
  if (!canAccessBrand(ctx, brandSlug)) throw new AdminScopeError();
  return clean(brandSlug);
}

/** Throws AdminScopeError unless the admin is a super-admin. */
export function requireSuperAdmin(
  ctx: AdminScopeContext | null | undefined,
): void {
  if (!ctx?.isSuperAdmin) throw new AdminScopeError();
}

/**
 * The brand filter for list queries and id-keyed writes.
 * - null: super-admin, no filter (all brands).
 * - string: the only brand this admin may see.
 * Throws when a non-super admin has no current brand, so a query can never
 * silently run unfiltered.
 */
export function adminScope(
  ctx: AdminScopeContext | null | undefined,
): string | null {
  if (!ctx) throw new AdminScopeError();
  if (ctx.isSuperAdmin) return null;
  const scope = clean(ctx.currentCommunityId);
  if (!scope || !ctx.communities.includes(scope)) {
    throw new AdminScopeError();
  }
  return scope;
}

/**
 * The brand a new row should belong to.
 * - Brand admins: always their current brand. A different brand in the
 *   form is rejected rather than silently ignored.
 * - Super-admins: must name a brand explicitly, either in the form or by
 *   having picked one in the community switcher. Never a DB default.
 */
export function resolveWriteBrand(
  ctx: AdminScopeContext | null | undefined,
  requested: string | null | undefined,
): string {
  if (!ctx) throw new AdminScopeError();
  const asked = clean(requested);
  if (ctx.isSuperAdmin) {
    const brand = asked || clean(ctx.currentCommunityId);
    if (!brand) {
      throw new AdminScopeError("Pick a brand before saving.");
    }
    return brand;
  }
  const own = adminScope(ctx) as string;
  if (asked && asked !== own) throw new AdminScopeError();
  return own;
}

/** True when a row's brand is inside `scope` (null scope means all). */
export function inScope(
  scope: string | null,
  rowBrand: string | null | undefined,
): boolean {
  if (scope === null) return true;
  return clean(rowBrand) === scope;
}
