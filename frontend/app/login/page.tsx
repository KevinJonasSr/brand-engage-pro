import { isForgotPasswordEnabled, isMagicLinkEnabled } from "@/lib/auth-flags";
import { resolveAppUrl } from "@/lib/site-url";
import LoginClient from "./login-client";

export default function LoginPage() {
  return (
    <LoginClient
      magicLinkEnabled={isMagicLinkEnabled()}
      forgotPasswordEnabled={isForgotPasswordEnabled()}
      appOrigin={resolveAppUrl()}
    />
  );
}
