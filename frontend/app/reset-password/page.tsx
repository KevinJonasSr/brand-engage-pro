import { isForgotPasswordEnabled } from "@/lib/auth-flags";
import ResetPasswordForm from "./reset-password-form";

export default function ResetPasswordPage() {
  return <ResetPasswordForm forgotPasswordEnabled={isForgotPasswordEnabled()} />;
}
