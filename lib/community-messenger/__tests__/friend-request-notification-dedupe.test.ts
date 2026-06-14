import { describe, expect, it } from "vitest";
import { friendRequestNotificationDedupeKey } from "@/lib/community-messenger/use-friend-request-notification-realtime";

describe("friendRequestNotificationDedupeKey", () => {
  it("unifies notification INSERT and CFR UPDATE for accept", () => {
    const requestId = "req-1";
    const notifKey = friendRequestNotificationDedupeKey({
      kind: "friend_accepted",
      requestId,
      addresseeUserId: "peer-1",
      addresseeLabel: "Peer",
      createdAt: "2026-06-15T00:00:00.000Z",
    });
    const cfrKey = friendRequestNotificationDedupeKey({
      kind: "friend_status_changed",
      requestId,
      status: "accepted",
      requesterUserId: "me-1",
      addresseeUserId: "peer-1",
      createdAt: "2026-06-15T00:00:00.000Z",
    });
    expect(notifKey).toBe(cfrKey);
    expect(notifKey).toBe("friend_outcome:req-1:accepted");
  });

  it("unifies notification INSERT and CFR UPDATE for reject", () => {
    const requestId = "req-2";
    const notifKey = friendRequestNotificationDedupeKey({
      kind: "friend_rejected",
      requestId,
      addresseeUserId: "peer-2",
      addresseeLabel: "Peer",
      createdAt: "2026-06-15T00:00:00.000Z",
    });
    const cfrKey = friendRequestNotificationDedupeKey({
      kind: "friend_status_changed",
      requestId,
      status: "rejected",
      requesterUserId: "me-1",
      addresseeUserId: "peer-2",
      createdAt: "2026-06-15T00:00:00.000Z",
    });
    expect(notifKey).toBe(cfrKey);
  });
});
