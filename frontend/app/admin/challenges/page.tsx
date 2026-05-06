import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminDeleteEntryAction } from "@/app/admin/community/actions";
import { pickWinnerAction } from "./actions";

export const dynamic = "force-dynamic";

type ChallengeWithEntries = {
  id: string;
  brand_slug: string;
  title: string | null;
  body: string;
  created_at: string;
  pinned: boolean;
  entries: Array<{
    id: string;
    member_id: string;
    member_first_name: string | null;
    body: string | null;
    image_url: string | null;
    created_at: string;
  }>;
  winner_id: string | null;
};

async function load(): Promise<ChallengeWithEntries[]> {
  const admin = createAdminClient();
  const { data: posts } = await admin
    .from("community_posts")
    .select("id,brand_slug,title,body,pinned,created_at")
    .eq("kind", "challenge")
    .order("created_at", { ascending: false })
    .limit(50);
  if (!posts || posts.length === 0) return [];
  const ids = posts.map((p) => p.id as string);
  const [{ data: entries }, { data: members }, { data: winners }] = await Promise.all([
    admin
      .from("community_challenge_entries")
      .select("id,post_id,member_id,body,image_url, image_alt,created_at")
      .in("post_id", ids)
      .order("created_at", { ascending: false }),
    admin.from("members").select("id,first_name"),
    admin
      .from("campaign_items")
      .select("metadata,ref_id")
      .eq("item_kind", "challenge_winner")
      .in("ref_id", ids),
  ]);
  const nameById = new Map<string, string | null>(
    (members ?? []).map((f) => [f.id as string, (f.first_name as string | null) ?? null]),
  );
  const entriesByPost = new Map<string, ChallengeWithEntries["entries"]>();
  for (const e of entries ?? []) {
    const pid = e.post_id as string;
    const arr = entriesByPost.get(pid) ?? [];
    arr.push({
      id: e.id as string,
      member_id: e.member_id as string,
      member_first_name: nameById.get(e.member_id as string) ?? null,
      body: (e.body as string | null) ?? null,
      image_url: (e.image_url as string | null) ?? null,
      created_at: e.created_at as string,
    });
    entriesByPost.set(pid, arr);
  }
  const winnerByPost = new Map<string, string>();
  for (const w of winners ?? []) {
    const meta = (w.metadata ?? {}) as { member_id?: string };
    if (meta.member_id && w.ref_id) winnerByPost.set(w.ref_id as string, meta.member_id);
  }

  return posts.map((p) => ({
    id: p.id as string,
    brand_slug: p.brand_slug as string,
    title: (p.title as string | null) ?? null,
    body: p.body as string,
    pinned: p.pinned as boolean,
    created_at: p.created_at as string,
    entries: entriesByPost.get(p.id as string) ?? [],
    winner_id: winnerByPost.get(p.id as string) ?? null,
  }));
}

export default async function AdminChallengesPage() {
  const challenges = await load();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Challenges review
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Every active challenge and its entries. Pick a winner to grant a bonus badge + points.
        </p>
      </div>

      {challenges.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
          <p className="text-sm font-semibold">No challenges yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {challenges.map((c) => (
            <section key={c.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
                      /{c.brand_slug}
                    </span>
                    {c.winner_id && (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
                        Winner picked
                      </span>
                    )}
                  </div>
                  {c.title && <h2 className="mt-1 text-lg font-semibold">{c.title}</h2>}
                  <p className="mt-1 text-sm text-white/70 line-clamp-2">{c.body}</p>
                </div>
                <Link
                  href={`/brands/${c.brand_slug}/community`}
                  className="text-xs text-white/60 hover:text-white"
                >
                  View live →
                </Link>
              </header>

              {c.entries.length === 0 ? (
                <p className="mt-3 text-xs text-white/50">No entries yet.</p>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {c.entries.map((e) => {
                    const isWinner = c.winner_id === e.member_id;
                    return (
                      <div
                        key={e.id}
                        className={`rounded-xl border p-3 ${
                          isWinner
                            ? "border-emerald-500/50 bg-emerald-500/10"
                            : "border-white/10 bg-black/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <Link
                            href={`/admin/members/${e.member_id}`}
                            className="text-xs font-semibold hover:text-white"
                          >
                            {e.member_first_name ?? "Anonymous"}
                            {isWinner && " 🏆"}
                          </Link>
                          <span className="text-[10px] text-white/40">
                            {new Date(e.created_at).toLocaleString()}
                          </span>
                        </div>
                        {e.body && (
                          <p className="mt-2 text-sm text-white/80 line-clamp-3">{e.body}</p>
                        )}
                        {e.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={e.image_url}
                            alt=""
                            className="mt-2 max-h-48 w-full rounded-lg object-cover"
                          />
                        )}
                        <div className="mt-3 flex items-center justify-between">
                          {!c.winner_id ? (
                            <form action={pickWinnerAction}>
                              <input type="hidden" name="post_id" value={c.id} />
                              <input type="hidden" name="entry_id" value={e.id} />
                              <input type="hidden" name="member_id" value={e.member_id} />
                              <button className="rounded-full bg-gradient-to-r from-aurora to-ember px-3 py-1 text-[11px] font-semibold text-white">
                                Pick winner · +200 pts
                              </button>
                            </form>
                          ) : (
                            <span />
                          )}
                          <form action={adminDeleteEntryAction}>
                            <input type="hidden" name="entry_id" value={e.id} />
                            <button className="text-[11px] text-rose-300/80 hover:text-rose-300">
                              Delete
                            </button>
                          </form>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
