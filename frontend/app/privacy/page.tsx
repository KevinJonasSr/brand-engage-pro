import type { Metadata } from "next";
import StaticPolicyPage from "@/app/(legal)/static-policy-page";
import {
  PRIVACY_POLICY,
  PRIVACY_REPLACES_DB_UPDATED_BEFORE,
} from "@/lib/legal/published-policies";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <StaticPolicyPage
      slug="privacy"
      fallback={PRIVACY_POLICY}
      replaceDbUpdatedBefore={PRIVACY_REPLACES_DB_UPDATED_BEFORE}
    />
  );
}
