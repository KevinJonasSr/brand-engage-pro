import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreatePredictionForm } from "./create-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New prediction · Admin · Brand Engage Pro" };

interface BrandRow {
  slug: string;
  name: string;
}

export default async function NewPredictionPage() {
  const adminUser = await getAdminUser();
  if (!adminUser) redirect("/login");

  const admin = createAdminClient();
  const { data: brandRows } = await admin
    .from("brands")
    .select("slug, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  const brands = ((brandRows ?? []) as unknown as BrandRow[]).map((b) => ({
    slug: b.slug,
    name: b.name,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            New prediction
          </h1>
          <p className="mt-1 text-sm text-white/65">
            Pose a question with a verifiable answer. Members vote — you reveal
            the result later and points get awarded automatically.
          </p>
        </div>
        <Link
          href="/admin/predictions"
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/75 hover:bg-white/5"
        >
          ← Back to queue
        </Link>
      </header>

      <CreatePredictionForm brands={brands} />
    </div>
  );
}
