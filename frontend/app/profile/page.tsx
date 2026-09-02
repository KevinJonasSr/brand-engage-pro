/**
 * Cheap /profile door. Walkers hit this after Finish and got a 404.
 * Signed-in members with a public slug go to /members/<slug>; otherwise /me.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getMemberProfileBySlug,
  getMemberProfileSlug,
} from "@/lib/data/member-profile";

export const dynamic = "force-dynamic";

export default async function ProfileShortcutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile");

  const slug = await getMemberProfileSlug(user.id);
  if (slug) {
    const profile = await getMemberProfileBySlug(slug);
    if (profile) redirect(`/members/${slug}`);
  }
  redirect("/me");
}
