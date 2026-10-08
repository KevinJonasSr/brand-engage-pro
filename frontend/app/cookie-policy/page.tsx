import type { Metadata } from "next";
import StaticPolicyPage from "@/app/(legal)/static-policy-page";
import { COOKIE_POLICY } from "@/lib/legal/published-policies";

export const metadata: Metadata = {
  title: "Cookie Policy",
};

export const dynamic = "force-dynamic";

export default function Page() {
  return <StaticPolicyPage slug="cookie_policy" fallback={COOKIE_POLICY} />;
}
