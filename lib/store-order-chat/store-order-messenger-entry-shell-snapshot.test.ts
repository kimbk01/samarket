import { describe, expect, it } from "vitest";
import { primeRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import {
  buildStoreOrderMessengerShellSnapshot,
  resolveInstantStoreOrderMessengerEntrySnapshot,
} from "@/lib/store-order-chat/store-order-messenger-entry-shell-snapshot";

describe("resolveInstantStoreOrderMessengerEntrySnapshot", () => {
  it("delivery contextMeta 로 placeholder 셸을 만든다", () => {
    const snap = resolveInstantStoreOrderMessengerEntrySnapshot({
      roomId: "room-1",
      contextMeta: {
        v: 1,
        kind: "delivery",
        headline: "매장 · 라떼",
        storeOrderId: "ord-1",
        storeId: "store-1",
      },
      myRole: "owner",
    });
    expect(snap.clientShellPlaceholder).toBe(true);
    expect(snap.myRole).toBe("owner");
    expect(snap.room.contextMeta?.storeOrderId).toBe("ord-1");
    expect(snap.room.title).toBe("매장 · 라떼");
  });

  it("peek 실스냅샷(메시지 0건)이 있으면 셸보다 우선한다", () => {
    const peeked = {
      viewerUserId: "u1",
      myRole: "member" as const,
      room: {
        id: "room-peek",
        roomType: "direct" as const,
        unreadCount: 0,
        lastMessage: "",
        contextMeta: { v: 1 as const, kind: "delivery" as const, storeOrderId: "o1", headline: "x" },
      },
      members: [],
      messages: [],
      readReceipt: null,
      activeCall: null,
    } as unknown as CommunityMessengerRoomSnapshot;
    primeRoomSnapshot("room-peek", peeked);
    const snap = resolveInstantStoreOrderMessengerEntrySnapshot({
      roomId: "room-peek",
      contextMeta: { v: 1, kind: "delivery", headline: "fallback", storeOrderId: "o2" },
    });
    expect(snap.clientShellPlaceholder).toBeUndefined();
    expect(snap.room.id).toBe("room-peek");
  });
});

describe("buildStoreOrderMessengerShellSnapshot", () => {
  it("memberCount 를 2 로 둔다", () => {
    const snap = buildStoreOrderMessengerShellSnapshot({
      roomId: "r1",
      contextMeta: { v: 1, kind: "delivery", headline: "주문" },
    });
    expect(snap.room.memberCount).toBe(2);
  });
});
