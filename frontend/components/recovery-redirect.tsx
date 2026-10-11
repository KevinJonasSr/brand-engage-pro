"use client";

import { useEffect } from "react";
import { recoveryRedirectTarget } from "@/lib/recovery-hash";

/** Moves a password recovery link that landed on any page to /reset-password. */
export default function RecoveryRedirect() {
  useEffect(() => {
    const target = recoveryRedirectTarget(window.location.pathname, window.location.hash);
    if (target) window.location.replace(target);
  }, []);
  return null;
}
