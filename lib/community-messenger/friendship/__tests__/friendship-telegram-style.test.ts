import { describe, expect, it } from "vitest";
import { COMMUNITY_MESSENGER_FRIENDSHIP_READD_BLOCK_MS } from "@/lib/community-messenger/friendship/constants";
import { filterGeneralDirectRoomsByFriendshipAccepted } from "@/lib/community-messenger/friendship/direct-room-list-filter";
import {
  assertCanAddFriend,
  assertCanSendDirectMessage,
  assertCanStartDirectCall,
  assertCanUnblockFriend,
} from "@/lib/community-messenger/friendship/friendship-permission-guards";
import {
  batchResolveCommunityMessengerFriendshipStatus,
  resolveCommunityMessengerFriendshipStatus,
} from "@/lib/community-messenger/friendship/friendship-resolver";
import {
  mapFriendshipStateToSearchGuard,
} from "@/lib/community-messenger/friendship/search-response-mapper";
import type { CommunityMessengerFriendshipState } from "@/lib/community-messenger/friendship/types";

function state(partial: Partial<CommunityMessengerFriendshipState>): CommunityMessengerFriendshipState {
  return {
    status: "none",
    friendshipStatus: "none",
    friendshipId: null,
    canMessage: false,
    canCall: false,
    canAddFriend: true,
    canUnblock: false,
    isFriend: false,
    isBlockedByMe: false,
    isBlockedByPeer: false,
    readdBlockedUntil: null,
    requestRoomId: null,
    requestMessageId: null,
    ...partial,
  };
}

describe("mapFriendshipStateToSearchGuard", () => {
  it("maps accepted to message/call enabled", () => {
    const mapped = mapFriendshipStateToSearchGuard(
      state({ status: "accepted", friendshipStatus: "accepted", isFriend: true, canMessage: true, canCall: true })
    );
    expect(mapped.canMessage).toBe(true);
    expect(mapped.canCall).toBe(true);
    expect(mapped.relationshipStatus).toBe("accepted");
  });

  it("maps pending outgoing to request sent state", () => {
    const mapped = mapFriendshipStateToSearchGuard(
      state({
        status: "request_pending_outgoing",
        friendshipStatus: "pending",
        canAddFriend: false,
      })
    );
    expect(mapped.canSendFriendRequest).toBe(false);
    expect(mapped.relationshipStatus).toBe("request_pending_outgoing");
  });
});

describe("friendship permission guards (pure state expectations)", () => {
  it("readd block constant is 24h", () => {
    expect(COMMUNITY_MESSENGER_FRIENDSHIP_READD_BLOCK_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("direct room list filter", () => {
  it("keeps trade direct rooms without friendship filtering", async () => {
    const rooms = await filterGeneralDirectRoomsByFriendshipAccepted("viewer-1", [
      { id: "r1", room_type: "direct", direct_key: "trade_item:abc:viewer-1" },
      { id: "r2", room_type: "group", direct_key: null },
    ]);
    expect(rooms.map((r) => r.id)).toEqual(["r1", "r2"]);
  });
});

describe("friendship resolver without DB", () => {
  it("returns none for empty viewer", async () => {
    const resolved = await resolveCommunityMessengerFriendshipStatus({
      viewerUserId: "",
      peerUserId: "peer-1",
    });
    expect(resolved.status).toBe("none");
    expect(resolved.canMessage).toBe(false);
  });

  it("batch resolver returns empty map for no peers", async () => {
    const map = await batchResolveCommunityMessengerFriendshipStatus("viewer-1", []);
    expect(map.size).toBe(0);
  });
});

describe("guard API surface", () => {
  it("exports unified guard functions", () => {
    expect(typeof assertCanSendDirectMessage).toBe("function");
    expect(typeof assertCanStartDirectCall).toBe("function");
    expect(typeof assertCanAddFriend).toBe("function");
    expect(typeof assertCanUnblockFriend).toBe("function");
  });
});
