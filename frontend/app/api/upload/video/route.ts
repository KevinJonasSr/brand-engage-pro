import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext, requireWritableBrand } from "@/lib/admin";
import { BRAND_WRITE_TRY_AGAIN_MESSAGE, BrandWriteError } from "@/lib/brand-billing";
import { canAccessBrand } from "@/lib/admin-scope";

/**
 * POST /api/upload/video
 * Body: multipart/form-data
 *   - file: File (required, video/mp4|webm|quicktime, max 50 MB)
 *
 * Response: { url: string, path: string }
 *
 * Admin-only endpoint. Uploads go to `community-videos/{admin_user_id}/{timestamp}-{safe_filename}`.
 *
 * The only caller is components/video-uploader.tsx (member post form).
 * The caller must be an admin. When `brand` is sent, they must admin that
 * brand. Otherwise the admin's current brand is checked. A locked brand
 * cannot upload. A lookup error returns 503.
 */
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime", // .mov
]);

function safeFilename(name: string): string {
  // Strip path pieces, keep last 40 chars, ascii-safe.
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(-40);
}

export async function POST(req: NextRequest) {
  // Admin-only gate
  const adminCtx = await getAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "Not authenticated as admin" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const requestedBrand = String(form.get("brand") ?? "").trim();
  const brand = requestedBrand || (adminCtx.currentCommunityId ?? "").trim();

  if (requestedBrand && !canAccessBrand(adminCtx, requestedBrand)) {
    return NextResponse.json(
      { error: "You can only upload for a brand you manage." },
      { status: 403 },
    );
  }
  if (!brand && !adminCtx.isSuperAdmin) {
    return NextResponse.json(
      { error: BRAND_WRITE_TRY_AGAIN_MESSAGE },
      { status: 503 },
    );
  }
  if (brand) {
    try {
      await requireWritableBrand(adminCtx, brand);
    } catch (err) {
      if (err instanceof BrandWriteError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only MP4, WebM, or MOV videos allowed" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Video exceeds 50 MB limit" },
      { status: 400 },
    );
  }

  const path = `${adminCtx.user.id}/${Date.now()}-${safeFilename(file.name)}`;

  // Use admin client for the upload, ownership enforced by path prefix.
  const admin = createAdminClient();
  const { error: uploadErr } = await admin.storage
    .from("community-videos")
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000", // 1 year
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: publicUrl } = admin.storage
    .from("community-videos")
    .getPublicUrl(path);

  return NextResponse.json({ url: publicUrl.publicUrl, path });
}
