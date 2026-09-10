/**
 * Group Create / Invite shared member picker — eligibility SSOT.
 * FOUND USER ≠ INVITABLE USER. Aligns with backend FRIEND_REQUIRED.
 */

export const GROUP_MEMBER_PICKER_ELIGIBILITY = {
  SELF: "SELF",
  ALREADY_MEMBER: "ALREADY_MEMBER",
  FRIEND: "FRIEND",
  NON_FRIEND: "NON_FRIEND",
  PENDING_FRIEND_REQUEST: "PENDING_FRIEND_REQUEST",
} as const;

export type GroupMemberPickerEligibility =
  (typeof GROUP_MEMBER_PICKER_ELIGIBILITY)[keyof typeof GROUP_MEMBER_PICKER_ELIGIBILITY];

export type ResolveGroupMemberPickerEligibilityArgs = {
  userId: string;
  viewerUserId: string | null | undefined;
  isFriend: boolean;
  memberIds: ReadonlySet<string>;
  pendingFriendRequestIds: ReadonlySet<string>;
};

export function resolveGroupMemberPickerEligibility(
  args: ResolveGroupMemberPickerEligibilityArgs
): GroupMemberPickerEligibility {
  const userId = args.userId.trim();
  const viewerId = (args.viewerUserId ?? "").trim();
  if (viewerId && userId === viewerId) return GROUP_MEMBER_PICKER_ELIGIBILITY.SELF;
  if (args.memberIds.has(userId)) return GROUP_MEMBER_PICKER_ELIGIBILITY.ALREADY_MEMBER;
  if (args.isFriend) return GROUP_MEMBER_PICKER_ELIGIBILITY.FRIEND;
  if (args.pendingFriendRequestIds.has(userId)) {
    return GROUP_MEMBER_PICKER_ELIGIBILITY.PENDING_FRIEND_REQUEST;
  }
  return GROUP_MEMBER_PICKER_ELIGIBILITY.NON_FRIEND;
}

/** Only accepted friends who are not already members may be selected for create/invite. */
export function isGroupMemberPickerSelectable(
  eligibility: GroupMemberPickerEligibility
): boolean {
  return eligibility === GROUP_MEMBER_PICKER_ELIGIBILITY.FRIEND;
}
