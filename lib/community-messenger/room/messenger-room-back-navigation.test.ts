import { describe, expect, it } from "vitest";
import {
  getMessengerRoomBackOverride,
  resolveMessengerRoomBackNavigation,
  setMessengerRoomBackOverride,
} from "@/lib/community-messenger/room/messenger-room-back-navigation";

describe("resolveMessengerRoomBackNavigation", () => {
  it("cm_return beats room back override", () => {
    setMessengerRoomBackOverride("room-1", {
      href: "/stores/browse/restaurant?sub=all",
      forceDirect: true,
    });
    const plan = resolveMessengerRoomBackNavigation({
      roomId: "room-1",
      searchParams: {
        get: (k) => (k === "cm_return" ? "/mypage/store-orders" : null),
      },
    });
    expect(plan.href).toBe("/mypage/store-orders");
    expect(plan.forceDirect).toBe(false);
    setMessengerRoomBackOverride("room-1", null);
  });

  it("uses override when cm_return absent", () => {
    setMessengerRoomBackOverride("room-2", {
      href: "/custom-fallback",
      forceDirect: true,
    });
    const plan = resolveMessengerRoomBackNavigation({
      roomId: "room-2",
      searchParams: { get: () => null },
    });
    expect(plan.href).toBe("/custom-fallback");
    expect(plan.forceDirect).toBe(true);
    setMessengerRoomBackOverride("room-2", null);
  });

  it("cm_list=delivery falls back to delivery-chats without cm_return", () => {
    const plan = resolveMessengerRoomBackNavigation({
      roomId: "room-3",
      searchParams: {
        get: (k) => (k === "cm_list" ? "delivery" : k === "from" ? "delivery" : null),
      },
    });
    expect(plan.href).toContain("/community-messenger/delivery-chats");
    expect(plan.forceDirect).toBe(false);
    expect(getMessengerRoomBackOverride("room-3")).toBeNull();
  });
});
