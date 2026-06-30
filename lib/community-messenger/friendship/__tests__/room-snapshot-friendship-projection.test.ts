import { describe, expect, it } from "vitest";
import type { FriendshipSsotRow } from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";
import type { ResolveFriendshipPairResult } from "@/lib/community-messenger/friendship/resolve-friendship-pair";
import { projectRoomSnapshotFriendshipFromResolution } from "@/lib/community-messenger/friendship/room-snapshot-friendship-projection";

const VIEWER = "11111111-1111-1111-1111-111111111111";
const PEER = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";

function row(partial: Partial<FriendshipSsotRow> & Pick<FriendshipSsotRow, "status">): FriendshipSsotRow {
  return {
    id: "row-pending-1",
    requester_user_id: VIEWER,
    addressee_user_id: PEER,
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:00:00.000Z",
    ...partial,
  };
}

function resolved(partial: Partial<ResolveFriendshipPairResult>): ResolveFriendshipPairResult {
  return {
    state: "none",
    direction: "none",
    row: null,
    source: "none",
    ...partial,
  };
}

describe("projectRoomSnapshotFriendshipFromResolution", () => {
  it("maps accepted → mutual_accepted", () => {
    const out = projectRoomSnapshotFriendshipFromResolution(
      resolved({
        state: "accepted",
        direction: "mutual_accepted",
        source: "friendships_ssot",
        row: row({ status: "accepted", accepted_at: "2026-06-30T01:00:00.000Z" }),
      })
    );
    expect(out.peerFriendshipState).toBe("accepted");
    expect(out.friendshipDirection).toBe("mutual_accepted");
    expect(out.pendingFriendshipRequestId).toBeUndefined();
  });

  it("maps pending incoming → pending + request id", () => {
    const ssotRow = row({ status: "pending", requester_user_id: PEER, addressee_user_id: VIEWER });
    const out = projectRoomSnapshotFriendshipFromResolution(
      resolved({
        state: "pending",
        direction: "incoming_pending",
        source: "friendships_ssot",
        row: ssotRow,
      })
    );
    expect(out.peerFriendshipState).toBe("pending");
    expect(out.friendshipDirection).toBe("incoming_pending");
    expect(out.pendingFriendshipRequestId).toBe("row-pending-1");
  });

  it("maps pending outgoing → pending + request id", () => {
    const out = projectRoomSnapshotFriendshipFromResolution(
      resolved({
        state: "pending",
        direction: "outgoing_pending",
        source: "friendships_ssot",
        row: row({ status: "pending" }),
      })
    );
    expect(out.peerFriendshipState).toBe("pending");
    expect(out.friendshipDirection).toBe("outgoing_pending");
    expect(out.pendingFriendshipRequestId).toBe("row-pending-1");
  });

  it("maps blocked SSOT → peerFriendshipState blocked", () => {
    const out = projectRoomSnapshotFriendshipFromResolution(
      resolved({
        state: "blocked",
        direction: "none",
        source: "friendships_ssot",
        row: row({ status: "blocked" }),
      })
    );
    expect(out.peerFriendshipState).toBe("blocked");
    expect(out.friendshipDirection).toBe("none");
    expect(out.pendingFriendshipRequestId).toBeUndefined();
  });

  it("maps none → none direction", () => {
    const out = projectRoomSnapshotFriendshipFromResolution(
      resolved({ state: "none", direction: "none", source: "none", row: null })
    );
    expect(out.peerFriendshipState).toBe("none");
    expect(out.friendshipDirection).toBe("none");
    expect(out.pendingFriendshipRequestId).toBeUndefined();
  });

  it("maps readd_cooldown → blocked peerFriendshipState", () => {
    const out = projectRoomSnapshotFriendshipFromResolution(
      resolved({
        state: "readd_cooldown",
        direction: "none",
        source: "friendships_ssot",
        row: row({
          status: "removed",
          readd_blocked_until: "2026-12-31T00:00:00.000Z",
        }),
      })
    );
    expect(out.peerFriendshipState).toBe("blocked");
    expect(out.friendshipDirection).toBe("none");
    expect(out.pendingFriendshipRequestId).toBeUndefined();
  });
});
