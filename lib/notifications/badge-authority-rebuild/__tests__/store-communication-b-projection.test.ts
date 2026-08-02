import { describe, expect, it } from "vitest";
import {
  assertBStoreExcludedFromMemberSurfaces,
  deriveStoreCommunicationProjection,
  forbidAllStoreOwnerChatSum,
  resolveOwnerChatUnreadRoomCountForStore,
  resolveOwnerHubFabChatBadgeFromProjection,
  resolveOwnerRoomUnreadMessageCount,
} from "@/lib/notifications/badge-authority-rebuild/store-communication-b-projection";

describe("Slice 2-4 store-communication-b-projection", () => {
  it("store A: row = messages, Hub = rooms (not message sum)", () => {
    const proj = deriveStoreCommunicationProjection({
      ownerOrderUnreadByStoreId: { "store-a": 2 },
      ownerRoomIdsByStoreId: {
        "store-a": ["room-1", "room-2"],
      },
      rowUnreadByRoomId: {
        "room-1": 7,
        "room-2": 2,
      },
    });
    const a = proj.byStoreId["store-a"];
    expect(a.identityKey).toBe("store:store-a");
    expect(a.unreadRoomCount).toBe(2);
    expect(a.roomUnreadMessageCounts["room-1"]).toBe(7);
    expect(a.roomUnreadMessageCounts["room-2"]).toBe(2);
    expect(resolveOwnerRoomUnreadMessageCount(a.roomUnreadMessageCounts, "room-1")).toBe(7);
    // 9 would be wrong for Hub
    expect(a.unreadRoomCount).not.toBe(9);
  });

  it("keeps store A and store B independent (no sum)", () => {
    const byStore = { "store-a": 2, "store-b": 1 };
    expect(resolveOwnerChatUnreadRoomCountForStore(byStore, "store-a")).toBe(2);
    expect(resolveOwnerChatUnreadRoomCountForStore(byStore, "store-b")).toBe(1);
    expect(forbidAllStoreOwnerChatSum(byStore)).toBeNull();
    const proj = deriveStoreCommunicationProjection({
      ownerOrderUnreadByStoreId: byStore,
      ownerRoomIdsByStoreId: {
        "store-a": ["ra1", "ra2"],
        "store-b": ["rb1"],
      },
      rowUnreadByRoomId: { ra1: 5, ra2: 2, rb1: 4 },
    });
    expect(resolveOwnerHubFabChatBadgeFromProjection(proj, "store-a")).toBe(2);
    expect(resolveOwnerHubFabChatBadgeFromProjection(proj, "store-b")).toBe(1);
  });

  it("activeStoreId missing → 0 (no first-store invent)", () => {
    const byStore = { "store-a": 5, "store-b": 3 };
    expect(resolveOwnerChatUnreadRoomCountForStore(byStore, null)).toBe(0);
    expect(resolveOwnerChatUnreadRoomCountForStore(byStore, "")).toBe(0);
    expect(resolveOwnerChatUnreadRoomCountForStore(byStore, "store-missing")).toBe(0);
  });

  it("dedupes canonical room ids in row map", () => {
    const proj = deriveStoreCommunicationProjection({
      ownerOrderUnreadByStoreId: { "store-a": 1 },
      ownerRoomIdsByStoreId: {
        "store-a": ["room-1", "room-1", "room-1"],
      },
      rowUnreadByRoomId: { "room-1": 20 },
    });
    expect(Object.keys(proj.byStoreId["store-a"].roomUnreadMessageCounts)).toEqual(["room-1"]);
    expect(proj.byStoreId["store-a"].unreadRoomCount).toBe(1);
    expect(proj.byStoreId["store-a"].roomUnreadMessageCounts["room-1"]).toBe(20);
  });

  it("accepts store: prefix identity keys", () => {
    const proj = deriveStoreCommunicationProjection({
      ownerOrderUnreadByStoreId: { "store:abc": 1 },
    });
    expect(proj.byStoreId["abc"]?.identityKey).toBe("store:abc");
    expect(proj.byStoreId["abc"]?.unreadRoomCount).toBe(1);
  });

  it("excludes B_store from member surfaces (eligibility)", () => {
    expect(assertBStoreExcludedFromMemberSurfaces()).toBe(true);
  });
});
