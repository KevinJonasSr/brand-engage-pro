import type { Metadata } from "next";
import StaticPolicyPage from "@/app/(legal)/static-policy-page";
import { TERMS_POLICY } from "@/lib/legal/published-policies";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export const dynamic = "force-dynamic";

export default function Page() {
  return <StaticPolicyPage slug="terms" fallback={TERMS_POLICY} />;
}
