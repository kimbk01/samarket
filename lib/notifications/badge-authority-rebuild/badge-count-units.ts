/**
 * Slice 2-1 — Count unit brands for foundation only.
 * Do not rename existing Phase B runtime variables in this slice.
 */

export type UnreadMessageCount = number & { readonly __brand: "UnreadMessageCount" };
export type UnreadRoomCount = number & { readonly __brand: "UnreadRoomCount" };
export type UnreadNotificationCount = number & {
  readonly __brand: "UnreadNotificationCount";
};
export type UnresolvedMissedCallCount = number & {
  readonly __brand: "UnresolvedMissedCallCount";
};
export type OwnerActionRequiredCount = number & {
  readonly __brand: "OwnerActionRequiredCount";
};

export type MemberCommunicationProjection = Readonly<{
  memberUnreadRoomCount: UnreadRoomCount;
  memberUnresolvedMissedCallCount: UnresolvedMissedCallCount;
}>;

export type StoreCommunicationProjection = Readonly<{
  storeUnreadRoomCount: UnreadRoomCount;
  storeUnresolvedMissedCallCount: UnresolvedMissedCallCount;
}>;

export type MemberAppIconProjectionInput = Readonly<{
  memberUnreadNotificationCount: UnreadNotificationCount;
  memberUnreadRoomCount: UnreadRoomCount;
  memberUnresolvedMissedCallCount: UnresolvedMissedCallCount;
}>;

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

export function asUnreadMessageCount(n: number): UnreadMessageCount {
  return nonNeg(n) as UnreadMessageCount;
}

export function asUnreadRoomCount(n: number): UnreadRoomCount {
  return nonNeg(n) as UnreadRoomCount;
}

export function asUnreadNotificationCount(n: number): UnreadNotificationCount {
  return nonNeg(n) as UnreadNotificationCount;
}

export function asUnresolvedMissedCallCount(n: number): UnresolvedMissedCallCount {
  return nonNeg(n) as UnresolvedMissedCallCount;
}

export function asOwnerActionRequiredCount(n: number): OwnerActionRequiredCount {
  return nonNeg(n) as OwnerActionRequiredCount;
}

/**
 * Member App Icon input accepts A_member + B_member parts only.
 * Passing store axes fails — does not compute a contaminated total.
 */
export type MemberAppIconInputGuardResult =
  | { ok: true; input: MemberAppIconProjectionInput; memberAppIconTotal: number }
  | {
      ok: false;
      reason: "B_STORE_FORBIDDEN_IN_MEMBER_APP_ICON_INPUT";
    };

export function buildMemberAppIconProjectionInput(parts: {
  memberUnreadNotificationCount: number;
  memberUnreadRoomCount: number;
  memberUnresolvedMissedCallCount: number;
  storeUnreadRoomCount?: number;
  storeActionRequiredCount?: number;
}): MemberAppIconInputGuardResult {
  if (nonNeg(parts.storeUnreadRoomCount) > 0) {
    return { ok: false, reason: "B_STORE_FORBIDDEN_IN_MEMBER_APP_ICON_INPUT" };
  }
  const o = nonNeg(parts.storeActionRequiredCount);
  const input: MemberAppIconProjectionInput = {
    memberUnreadNotificationCount: asUnreadNotificationCount(
      parts.memberUnreadNotificationCount
    ),
    memberUnreadRoomCount: asUnreadRoomCount(parts.memberUnreadRoomCount),
    memberUnresolvedMissedCallCount: asUnresolvedMissedCallCount(
      parts.memberUnresolvedMissedCallCount
    ),
  };
  return {
    ok: true,
    input,
    memberAppIconTotal:
      input.memberUnreadNotificationCount +
      input.memberUnreadRoomCount +
      input.memberUnresolvedMissedCallCount +
      o,
  };
}
