import { notFound } from "next/navigation";
import Link from "next/link";
import { SimpleMarkdown } from "@/components/simple-markdown";
import { getPolicy } from "@/lib/data/policies";

export default async function PolicyPage({ slug }: { slug: string }) {
  const policy = await getPolicy(slug);
  if (!policy) notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-xs text-iron/50 hover:text-iron">
          ← Member Home
        </Link>
        {policy.effective_date && (
          <span className="text-xs text-iron/50">
            Effective {new Date(policy.effective_date).toLocaleDateString()}
          </span>
        )}
      </div>

      {policy.is_draft && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-aurora-ink">
          <p className="font-semibold">DRAFT — pending legal review</p>
          <p className="mt-1 text-xs text-aurora-ink/80">
            This document is a placeholder and is not the final legal text. Use at your own risk.
          </p>
        </div>
      )}

      <SimpleMarkdown source={policy.content_md} />

      <p className="pt-6 text-xs text-iron/40">
        Last updated {new Date(policy.updated_at).toLocaleDateString()}.
      </p>
    </main>
  );
}
