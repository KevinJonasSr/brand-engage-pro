/**
 * First 72 hours / first-session sticky loop.
 *
 * Same substance as Fan Engage: complete profile → join a brand →
 * first check-in or perk → invite a friend. Labels are member/brand
 * (Nellie's / JGE), not artist/fan. No list sends.
 */

export const FIRST_SESSION_WINDOW_HOURS = 72;
export const FIRST_SESSION_DISMISS_KEY = "bep_first72_dismissed";

export type FirstSessionStepId =
  | "profile"
  | "join"
  | "checkin_or_redeem"
  | "invite";

export type FirstSessionFacts = {
  hasProfile: boolean;
  hasJoinedBrand: boolean;
  hasCheckinOrRedeem: boolean;
  hasInvite: boolean;
};

export type FirstSessionStep = {
  id: FirstSessionStepId;
  label: string;
  detail: string;
  href: string;
  done: boolean;
};

/** Referrals + home eyebrow — matches FE "First 72 hours". */
export const FIRST_SESSION_EYEBROW = "First 72 hours";

export const FIRST_SESSION_TITLE = "Your first session";

/**
 * FE referrals: "Follow one artist, earn a first badge, then invite one
 * friend while the experience is fresh." BEP adaptation — Nellie's / JGE.
 * Keep guest copy on the published lock set only.
 */
export const FIRST_SESSION_BLURB =
  "Join Nellie's or JGE, check in or claim a perk, then invite one friend while the experience is fresh.";

export const EMPTY_FIRST_SESSION_FACTS: FirstSessionFacts = {
  hasProfile: false,
  hasJoinedBrand: false,
  hasCheckinOrRedeem: false,
  hasInvite: false,
};

export function firstSessionSteps(facts: FirstSessionFacts): FirstSessionStep[] {
  return [
    {
      id: "profile",
      label: "Complete your profile",
      detail: "Add your name so Nellie's and JGE can personalize the club.",
      href: "/onboarding",
      done: facts.hasProfile,
    },
    {
      id: "join",
      label: "Join Nellie's or JGE",
      detail: "Follow Nellie's Southern Kitchen or Jonas Group Entertainment.",
      href: "/brands",
      done: facts.hasJoinedBrand,
    },
    {
      id: "checkin_or_redeem",
      label: "First check-in or perk",
      detail: "Check in at Nellie's or claim a member perk.",
      href: "/brands/nellies/checkin",
      done: facts.hasCheckinOrRedeem,
    },
    {
      id: "invite",
      label: "Invite a friend",
      detail: "Share your link while the first session is still fresh.",
      href: "/referrals",
      done: facts.hasInvite,
    },
  ];
}

export function firstSessionDoneCount(facts: FirstSessionFacts): number {
  return firstSessionSteps(facts).filter((step) => step.done).length;
}

export function isFirstSessionComplete(facts: FirstSessionFacts): boolean {
  return firstSessionSteps(facts).every((step) => step.done);
}

export function shouldShowFirstSessionChecklist(
  facts: FirstSessionFacts,
  dismissed: boolean,
): boolean {
  if (dismissed) return false;
  return !isFirstSessionComplete(facts);
}
