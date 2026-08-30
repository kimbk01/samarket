/**
 * Authenticated notification / private-event presentation gate (pure SSOT).
 *
 * Native Android/iOS delivery layers MUST mirror this logic.
 * Default: fail-closed — guest / logout / identity mismatch → DROP.
 *
 * There is no product public/guest tray allowlist today; all user-targeted
 * FCM/APNs/VoIP private events require an authenticated member projection.
 */

export type CanPresentAuthenticatedNotificationInput = Readonly<{
  /** Local member-event eligibility (AUTHENTICATED → true; logout/guest → false). */
  memberEventEligible: boolean;
  /** Native/JS bound auth user id; empty when guest or cleared. */
  boundUserId: string | null | undefined;
  /**
   * Payload recipient identity when present (`recipientMemberId` / `userId` / `user_id`).
   * Empty/missing → identity match is not required (eligibility + bound still required).
   */
  payloadRecipientUserId: string | null | undefined;
}>;

export type CanPresentAuthenticatedNotificationResult = Readonly<{
  ok: boolean;
  reason:
    | "present"
    | "member_event_ineligible"
    | "bound_user_missing"
    | "recipient_user_mismatch";
}>;

function trimId(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Decide whether an authenticated private notification/call may present
 * tray / sound / badge / deeplink / sustained incoming UI.
 */
export function canPresentAuthenticatedNotification(
  input: CanPresentAuthenticatedNotificationInput,
): CanPresentAuthenticatedNotificationResult {
  if (input.memberEventEligible !== true) {
    return { ok: false, reason: "member_event_ineligible" };
  }
  const bound = trimId(input.boundUserId);
  if (!bound) {
    return { ok: false, reason: "bound_user_missing" };
  }
  const recipient = trimId(input.payloadRecipientUserId);
  if (recipient && recipient !== bound) {
    return { ok: false, reason: "recipient_user_mismatch" };
  }
  return { ok: true, reason: "present" };
}

/** Resolve recipient id from FCM/APNs data map (wire keys). */
export function resolvePushPayloadRecipientUserId(
  data: Record<string, unknown> | null | undefined,
): string | null {
  if (!data || typeof data !== "object") return null;
  const keys = [
    "recipientMemberId",
    "recipient_member_id",
    "targetUserId",
    "target_user_id",
    "userId",
    "user_id",
    "recipientUserId",
    "recipient_user_id",
  ] as const;
  for (const key of keys) {
    const raw = data[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}
