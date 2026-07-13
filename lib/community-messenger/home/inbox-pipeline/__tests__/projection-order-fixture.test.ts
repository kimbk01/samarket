import { describe, expect, it } from "vitest";
import { buildMessengerHomeProjectionWithOrder } from "@/lib/community-messenger/home/inbox-pipeline/shadow-diagnostics";
import type { CanonicalMessengerHomeRoom } from "@/lib/community-messenger/home/inbox-pipeline/types";

function tradeRoom(id: string, productChatId: string, completedAt: string | null): CanonicalMessengerHomeRoom {
  return {
    roomId: id,
    roomType: "direct",
    directKey: `trade_pc:${productChatId}`,
    contextMeta: {
      v: 1,
      kind: "trade",
      productChatId,
      completedAt: completedAt ?? undefined,
      tradeFlowStatus: completedAt ? "buyer_confirmed" : undefined,
    },
    title: id,
    avatarUrl: null,
    latestMessage: "hi",
    lastMessageAt: "2026-07-13T00:00:00.000Z",
    unreadCount: 0,
    isArchived: false,
    isBlockedHidden: false,
    roomStatus: "active",
    memberCount: 2,
  };
}

describe("projection order fixture", () => {
  const nowMs = Date.parse("2026-07-13T00:00:00.000Z");
  const rooms: CanonicalMessengerHomeRoom[] = [
    tradeRoom("winner", "pc-1", null),
    tradeRoom("completed-hidden", "pc-1", "2026-06-01T00:00:00.000Z"),
  ];

  it("dedupe-before-lifecycle keeps newer active duplicate winner", () => {
    const projection = buildMessengerHomeProjectionWithOrder(rooms, "viewer", "dedupe_before_lifecycle", nowMs);
    expect(projection.tradeRoomIds).toEqual(["winner"]);
  });

  it("lifecycle-before-dedupe matches product order for duplicate trade keys", () => {
    const a = buildMessengerHomeProjectionWithOrder(rooms, "viewer", "dedupe_before_lifecycle", nowMs);
    const b = buildMessengerHomeProjectionWithOrder(rooms, "viewer", "lifecycle_before_dedupe", nowMs);
    expect(a.tradeRoomIds).toEqual(b.tradeRoomIds);
  });
});
