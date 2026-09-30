/**
 * Control Center moderation CTAs — Owner P0 state machine.
 * DO NOT invent transitions. profiles.role is not consulted.
 * WITHDRAWN has no restore CTA (anonymize is not reversible via admin restore).
 */

export const MEMBER_MODERATION_ACTIONS = ["warn", "suspend", "ban", "restore"] as const;
export type MemberModerationAction = (typeof MEMBER_MODERATION_ACTIONS)[number];

export function memberModerationActionsForStatus(
  moderationStatus: string | null | undefined
): MemberModerationAction[] {
  const status = String(moderationStatus ?? "").trim().toLowerCase();
  if (status === "withdrawn") return [];
  // blocked (and legacy "banned" display) → unblock only
  if (status === "blocked" || status === "banned") return ["restore"];
  if (status === "suspended") return ["restore", "ban"];
  return ["warn", "suspend", "ban"];
}
