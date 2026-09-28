import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BirthdayForm from "./birthday-form";

export const metadata = { title: "Birthday" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BirthdayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/birthday");

  // Own query, so a missing column only hides the saved month instead of
  // breaking a shared select (the #24/#25 class).
  const { data: member, error } = await supabase
    .from("members")
    .select("birthday_month")
    .eq("id", user.id)
    .maybeSingle();
  if (error) console.error("BirthdayPage: birthday_month read failed", error);

  const month = (member?.birthday_month as number | null | undefined) ?? null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <Link
          href="/me"
          className="text-xs uppercase tracking-widest text-white/60 hover:text-white"
        >
          ← Account
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Birthday</h1>
        <p className="mt-3 text-white/70">
          Tell us your birthday month so your birthday treats show up on time.
        </p>
      </header>

      <BirthdayForm initialMonth={month} />
    </main>
  );
}
