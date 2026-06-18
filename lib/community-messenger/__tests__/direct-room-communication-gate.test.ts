import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/community-messenger/social-relations", () => ({
  isBlockedEitherWayActive: vi.fn(async () => false),
}));

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: { room_type: "direct", direct_key: "peer-a:peer-b" },
          })),
        })),
      })),
    })),
  })),
}));

import { isBlockedEitherWayActive } from "@/lib/community-messenger/social-relations";
import {
  assertDirectRoomCommunicationNotBlocked,
  resolveDirectRoomPeerUserId,
} from "@/lib/community-messenger/direct-room-communication-gate";

describe("direct-room-communication-gate", () => {
  beforeEach(() => {
    vi.mocked(isBlockedEitherWayActive).mockReset();
    vi.mocked(isBlockedEitherWayActive).mockResolvedValue(false);
  });

  it("resolveDirectRoomPeerUserId returns peer from direct_key", async () => {
    const peer = await resolveDirectRoomPeerUserId("room-1", "peer-a");
    expect(peer).toBe("peer-b");
  });

  it("denies when active block exists", async () => {
    vi.mocked(isBlockedEitherWayActive).mockResolvedValue(true);
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
});
