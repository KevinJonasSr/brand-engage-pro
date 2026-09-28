import { redirect } from "next/navigation";

// Birthday month lives with the other account settings.
export default function SettingsBirthdayRedirect() {
  redirect("/me/birthday");
}
