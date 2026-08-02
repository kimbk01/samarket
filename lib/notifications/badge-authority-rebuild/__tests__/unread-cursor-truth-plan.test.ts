import { describe, expect, it } from "vitest";
import {
  auditUnreadProjectionForIdentity,
  compareUnreadTruthToProjection,
  deriveUnreadTruthForRoom,
} from "@/lib/notifications/badge-authority-rebuild/unread-cursor-truth-plan";
import {
  MEMBER_APP_ICON_EXCLUSIONS_LOCKED,
  NATIVE_APP_ICON_BLOCKS_STORE_AXES,
  projectMemberAppIconTotal,
} from "@/lib/notifications/badge-authority-rebuild/phase1-authority-contract";

describe("Phase 2A unread cursor truth plan (fixtures only)", () => {
  it("derived 0 → not an unread room", () => {
    expect(deriveUnreadTruthForRoom({ derivedUnreadMessageCount: 0 })).toEqual({
      truthUnreadMessageCount: 0,
      truthUnreadRoom: false,
    });
  });

  it("derived > 0 → unread room; mismatch if projection omits room", () => {
    const r = compareUnreadTruthToProjection({
      recipientIdentity: "user:u1",
      domain: "general_direct",
      roomId: "r1",
      latestReadableMessageId: "m20",
      readCursorMessageId: "m0",
      derivedUnreadMessageCount: 20,
      cachedUnreadMessageCount: 20,
      projectedUnreadRoomMembership: false,
    });
    expect(r.status).toBe("mismatch");
    expect(r.mismatchReason).toBe("room_missing_from_projection_set");
  });

  it("flags duplicate room membership keys", () => {
    expect(
      auditUnreadProjectionForIdentity({
        canonicalRoomId: "room-a",
        membershipKeys: ["room-a", "alias:room-a"],
      }).ok
    ).toBe(false);
  });
});

describe("Phase 1 product locks carried into Phase 2A", () => {
  it("locks B_store/C_store out of Member App Icon and Native store axes", () => {
    expect(MEMBER_APP_ICON_EXCLUSIONS_LOCKED).toEqual(
      expect.arrayContaining(["B_store", "C_store"])
    );
    expect(NATIVE_APP_ICON_BLOCKS_STORE_AXES).toBe(true);
    expect(
      projectMemberAppIconTotal({
        aMemberUnreadNotificationCount: 1,
        memberUnreadRoomCount: 1,
        unresolvedMissedCallCount: 0,
        ownerStoreChatRoomCount: 1,
      }).ok
    ).toBe(false);
  });
});
