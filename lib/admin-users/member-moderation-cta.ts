/**
 * Control Center moderation CTAs — must match backend warn/suspend/ban/restore.
 * DO NOT invent transitions. profiles.role is not consulted.
 */

export const MEMBER_MODERATION_ACTIONS = ["warn", "suspend", "ban", "restore"] as const;
export type MemberModerationAction = (typeof MEMBER_MODERATION_ACTIONS)[number];

export function memberModerationActionsForStatus(
  moderationStatus: string | null | undefined,
): MemberModerationAction[] {
  const status = String(moderationStatus ?? "").trim().toLowerCase();
  if (status === "banned") return ["restore"];
  if (status === "suspended") return ["restore", "ban"];
  return ["warn", "suspend", "ban"];
}
