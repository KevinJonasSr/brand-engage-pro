import { redirect } from "next/navigation";
import { isForgotPasswordEnabled } from "@/lib/auth-flags";
import ForgotPasswordForm from "./forgot-password-form";

/**
 * HOLD: production hides the reset form. Login already omits the link;
 * this route must not stay a 200 with a reset form.
 */
export default function ForgotPasswordPage() {
  if (!isForgotPasswordEnabled()) {
    redirect("/login");
  }
  return <ForgotPasswordForm />;
}
