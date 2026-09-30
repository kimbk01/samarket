/**
 * Control Center moderation CTAs — Owner P0 state machine.
 * P1: ActionPolicy is the authority; this module projects legacy action ids.
 * DO NOT invent transitions. profiles.role is not consulted.
 * WITHDRAWN has no restore CTA (anonymize is not reversible via admin restore).
 */

import { memberModerationActionIdsFromPolicy } from "@/lib/admin-users/member-admin-action-policy";

export const MEMBER_MODERATION_ACTIONS = ["warn", "suspend", "ban", "restore"] as const;
export type MemberModerationAction = (typeof MEMBER_MODERATION_ACTIONS)[number];

export function memberModerationActionsForStatus(
  moderationStatus: string | null | undefined,
): MemberModerationAction[] {
  return memberModerationActionIdsFromPolicy(moderationStatus, {
    canModerate: true,
    isSelf: false,
  });
}
