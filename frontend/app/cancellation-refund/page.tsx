import type { Metadata } from "next";
import StaticPolicyPage from "@/app/(legal)/static-policy-page";
import { CANCELLATION_POLICY } from "@/lib/legal/published-policies";

export const metadata: Metadata = {
  title: "Cancellation & Refund Policy",
};

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <StaticPolicyPage slug="cancellation_refund" fallback={CANCELLATION_POLICY} />
  );
}
