import { describe, expect, it } from "vitest";
import { dedupeDeliveryMessengerRoomSummaries } from "@/lib/community-messenger/dedupe-delivery-messenger-room-summaries";
import { deliveryMessengerListCanonicalKey } from "@/lib/community-messenger/delivery-list-canonical-key";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function deliverySummary(partial: Partial<CommunityMessengerRoomSummary>): CommunityMessengerRoomSummary {
  return {
    id: partial.id ?? "r1",
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: partial.lastMessageAt ?? "2026-01-01T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    messengerDirectKey: partial.messengerDirectKey ?? null,
    contextMeta: partial.contextMeta ?? null,
  };
}

describe("deliveryMessengerListCanonicalKey", () => {
  it("normalizes store_order and trade_order to delivery:{orderId}", () => {
    const store = deliveryMessengerListCanonicalKey(
      deliverySummary({ messengerDirectKey: "store_order:ord-1" })
    );
    const legacy = deliveryMessengerListCanonicalKey(
      deliverySummary({ messengerDirectKey: "trade_order:ord-1" })
    );
    expect(store).toBe("delivery:ord-1");
    expect(legacy).toBe("delivery:ord-1");
  });
});

describe("dedupeDeliveryMessengerRoomSummaries", () => {
  it("keeps one row when store_order and trade_order refer to the same order", () => {
    const legacy = deliverySummary({
      id: "room-legacy",
      messengerDirectKey: "trade_order:ord-1",
      lastMessageAt: "2026-01-01T00:00:00.000Z",
      contextMeta: { v: 1, kind: "delivery", storeOrderId: "ord-1" },
    });
    const canonical = deliverySummary({
      id: "room-canonical",
      messengerDirectKey: "store_order:ord-1",
      lastMessageAt: "2026-06-01T00:00:00.000Z",
      contextMeta: { v: 1, kind: "delivery", storeOrderId: "ord-1" },
    });
    const out = dedupeDeliveryMessengerRoomSummaries([legacy, canonical]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("room-canonical");
  });

  it("prefers the room with the newer lastMessageAt", () => {
    const older = deliverySummary({
      id: "room-old",
      messengerDirectKey: "store_order:ord-2",
      lastMessageAt: "2026-01-01T00:00:00.000Z",
      contextMeta: { v: 1, kind: "delivery", storeOrderId: "ord-2" },
    });
    const newer = deliverySummary({
      id: "room-new",
      messengerDirectKey: "store_order:ord-2",
      lastMessageAt: "2026-06-01T00:00:00.000Z",
      contextMeta: { v: 1, kind: "delivery", storeOrderId: "ord-2" },
    });
    const out = dedupeDeliveryMessengerRoomSummaries([older, newer]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("room-new");
  });
});
