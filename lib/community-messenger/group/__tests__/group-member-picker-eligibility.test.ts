import { describe, expect, it } from "vitest";
import {
  GROUP_MEMBER_PICKER_ELIGIBILITY,
  isGroupMemberPickerSelectable,
  resolveGroupMemberPickerEligibility,
} from "@/lib/community-messenger/group/group-member-picker-eligibility";

describe("group member picker eligibility SSOT", () => {
  const memberIds = new Set(["m1"]);
  const pending = new Set(["p1"]);

  it("SELF / ALREADY_MEMBER / FRIEND / PENDING / NON_FRIEND", () => {
    expect(
      resolveGroupMemberPickerEligibility({
        userId: "me",
        viewerUserId: "me",
        isFriend: true,
        memberIds,
        pendingFriendRequestIds: pending,
      })
    ).toBe(GROUP_MEMBER_PICKER_ELIGIBILITY.SELF);

    expect(
      resolveGroupMemberPickerEligibility({
        userId: "m1",
        viewerUserId: "me",
        isFriend: true,
        memberIds,
        pendingFriendRequestIds: pending,
      })
    ).toBe(GROUP_MEMBER_PICKER_ELIGIBILITY.ALREADY_MEMBER);

    expect(
      resolveGroupMemberPickerEligibility({
        userId: "f1",
        viewerUserId: "me",
        isFriend: true,
        memberIds,
        pendingFriendRequestIds: pending,
      })
    ).toBe(GROUP_MEMBER_PICKER_ELIGIBILITY.FRIEND);

    expect(
      resolveGroupMemberPickerEligibility({
        userId: "p1",
        viewerUserId: "me",
        isFriend: false,
        memberIds,
        pendingFriendRequestIds: pending,
      })
    ).toBe(GROUP_MEMBER_PICKER_ELIGIBILITY.PENDING_FRIEND_REQUEST);

    expect(
      resolveGroupMemberPickerEligibility({
        userId: "x1",
        viewerUserId: "me",
        isFriend: false,
        memberIds,
        pendingFriendRequestIds: pending,
      })
    ).toBe(GROUP_MEMBER_PICKER_ELIGIBILITY.NON_FRIEND);
  });

  it("only FRIEND is selectable for create/invite", () => {
    expect(isGroupMemberPickerSelectable(GROUP_MEMBER_PICKER_ELIGIBILITY.FRIEND)).toBe(true);
    expect(isGroupMemberPickerSelectable(GROUP_MEMBER_PICKER_ELIGIBILITY.NON_FRIEND)).toBe(false);
    expect(isGroupMemberPickerSelectable(GROUP_MEMBER_PICKER_ELIGIBILITY.PENDING_FRIEND_REQUEST)).toBe(
      false
    );
    expect(isGroupMemberPickerSelectable(GROUP_MEMBER_PICKER_ELIGIBILITY.ALREADY_MEMBER)).toBe(false);
  });
});
