import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertBStoreExcludedFromMemberSurfaces,
  resolveOwnerChatUnreadRoomCountForStore,
} from "@/lib/notifications/badge-authority-rebuild/store-communication-b-projection";
import { buildMemberAppIconWebProjection } from "@/lib/notifications/badge-authority-rebuild/member-communication-b-projection";
import { buildNotificationBadgeProjection, EMPTY_NON_CHAT_EVENT_ATTENTION } from "@/lib/notifications/build-notification-badge-projection";

describe("Slice 2-4 B_store exclusion + hub room unit", () => {
  it("eligibility excludes member surfaces", () => {
    expect(assertBStoreExcludedFromMemberSurfaces()).toBe(true);
  });

  it("Member App Icon builder rejects owner store contamination", () => {
    const rejected = buildMemberAppIconWebProjection({
      aMemberUnreadNotificationCount: 2,
      generalDirectUnreadRooms: 1,
      groupUnreadRooms: 0,
      tradeUnreadRooms: 0,
      customerStoreOrderUnreadRooms: 0,
      ownerStoreOrderUnreadRooms: 3,
    });
    expect(rejected.ok).toBe(false);
    const ok = buildMemberAppIconWebProjection({
      aMemberUnreadNotificationCount: 2,
      generalDirectUnreadRooms: 1,
      groupUnreadRooms: 0,
      tradeUnreadRooms: 0,
      customerStoreOrderUnreadRooms: 0,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.projection.memberAppIconWebTotal).toBe(3);
  });

  it("product projection keeps owner rooms off Member App Icon storeOrder slot", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 5 },
      storeOrderBuyerDeliveryUnread: 1,
      storeOrderOwnerChatUnread: 4,
      storeOrderOwnerUnreadByStoreId: { "store-a": 2, "store-b": 2 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      notificationAttentionTotal: 0,
      memberUnreadNotificationCount: 0,
      unreadApprovedNotificationEvents: 0,
    });
    expect(p.appIcon.storeOrder).toBe(1); // buyer only
    expect(p.storeOrderOwnerUnreadRooms).toBe(4);
    expect(p.storeOrderOwnerUnreadByStoreId["store-a"]).toBe(2);
    // Bottom Chat = GD+Group+Trade+Customer — buyer room, not owner rooms
    expect(p.bottomChat).toBe(1);
    expect(p.bellTotal).toBe(0);
    expect(p.storeOrderCustomerUnreadRooms).toBe(1);
  });

  it("active store resolve never sums A+B", () => {
    const by = { a: 2, b: 5 };
    expect(resolveOwnerChatUnreadRoomCountForStore(by, "a")).toBe(2);
    expect(resolveOwnerChatUnreadRoomCountForStore(by, "b")).toBe(5);
    expect(resolveOwnerChatUnreadRoomCountForStore(by, null)).toBe(0);
  });

  it("hub store-order counter uses room count not message sum (structural)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/store-order-chat-service.ts"),
      "utf8"
    );
    expect(src).toContain("Slice 2-4 B_store");
    expect(src).toContain("unreadRoomIds");
    expect(src).toMatch(/return roomCount/);
    expect(src).not.toMatch(
      /reduce\(\s*\(acc, row\) => acc \+ Math\.max\(0, Math\.floor\(Number\(row\.unread_count/
    );
  });

  it("snapshot payload prefers room-count override over targets", () => {
    const src = readFileSync(join(process.cwd(), "lib/chats/owner-hub-badge-snapshot.ts"), "utf8");
    expect(src).toContain("storeOrderChatUnreadRooms");
    expect(src).toContain("resolveActiveStoreOwnerChatRoomCount");
    expect(src).toContain("invalidateHubStoreOrderUnreadMemory");
  });
});
