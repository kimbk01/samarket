import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/social/user-block-ssot", () => ({
  fetchBlockedPairFromSb: vi.fn(async () => ({
    blockedByMe: false,
    blockedByPeer: false,
    blockedEitherWay: false,
  })),
}));

function chainable(terminalData: unknown) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  for (const kind of ["select", "eq", "or", "in", "is", "not", "order", "limit"]) {
    builder[kind] = self;
  }
  builder.maybeSingle = async () => ({ data: terminalData, error: null });
  builder.then = (resolve: (v: { data: unknown; error: null }) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: terminalData, error: null }).then(resolve, reject);
  return builder;
}

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "community_messenger_rooms") {
        return chainable({ room_type: "direct", direct_key: "peer-a:peer-b", chat_domain: "general_direct" });
      }
      if (table === "community_messenger_participants") {
        return chainable([]);
      }
      if (table === "product_chats" || table === "store_orders") {
        return chainable(null);
      }
      return chainable(null);
    }),
  })),
}));

import { fetchBlockedPairFromSb } from "@/lib/social/user-block-ssot";
import {
  assertDirectRoomCommunicationNotBlocked,
  resolveDirectRoomPeerUserId,
} from "@/lib/community-messenger/direct-room-communication-gate";

describe("direct-room-communication-gate", () => {
  beforeEach(() => {
    vi.mocked(fetchBlockedPairFromSb).mockReset();
    vi.mocked(fetchBlockedPairFromSb).mockResolvedValue({
      blockedByMe: false,
      blockedByPeer: false,
      blockedEitherWay: false,
    });
  });

  it("resolveDirectRoomPeerUserId returns peer from direct_key", async () => {
    const peer = await resolveDirectRoomPeerUserId("room-1", "peer-a");
    expect(peer).toBe("peer-b");
  });

  it("denies when active block exists on general direct", async () => {
    vi.mocked(fetchBlockedPairFromSb).mockResolvedValue({
      blockedByMe: true,
      blockedByPeer: false,
      blockedEitherWay: true,
    });
    const result = await assertDirectRoomCommunicationNotBlocked({
      viewerUserId: "peer-a",
      roomId: "room-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("blocked_target");
      expect(result.peerUserId).toBe("peer-b");
    }
  });

  it("allows when no active block", async () => {
    const result = await assertDirectRoomCommunicationNotBlocked({
      viewerUserId: "peer-a",
      roomId: "room-1",
    });
    expect(result.ok).toBe(true);
  });

  it("skips social block gate for trade domainEvidence (F-2)", async () => {
    vi.mocked(fetchBlockedPairFromSb).mockResolvedValue({
      blockedByMe: true,
      blockedByPeer: false,
      blockedEitherWay: true,
    });
    const result = await assertDirectRoomCommunicationNotBlocked({
      viewerUserId: "peer-a",
      roomId: "room-1",
      domainEvidence: {
        roomType: "direct",
        chatDomain: null,
        directKey: "a:b",
        hasProductChatLink: true,
        hasStoreOrderLink: false,
      },
    });
    expect(result.ok).toBe(true);
    expect(fetchBlockedPairFromSb).not.toHaveBeenCalled();
  });
});
