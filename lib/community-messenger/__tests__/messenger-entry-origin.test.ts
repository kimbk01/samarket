import { describe, expect, it } from "vitest";
import {
  bottomNavMessengerHrefWithOrigin,
  buildMessengerRoomListBackHref,
  inferMessengerEntryOriginFromPath,
  mainBottomNavMessengerTabHref,
  messengerEntryOriginBackHref,
  messengerEntryOriginToSecondaryRail,
  shouldForceDirectDeliveryMessengerRoomBack,
} from "@/lib/community-messenger/messenger-entry-origin";

describe("messengerEntryOriginBackHref", () => {
  it("출처별 1단 뒤로가기", () => {
    expect(messengerEntryOriginBackHref("community")).toBe("/philife");
    expect(messengerEntryOriginBackHref("trade")).toBe("/market");
    expect(messengerEntryOriginBackHref("delivery")).toBe("/stores");
    expect(messengerEntryOriginBackHref(null)).toBe("/philife");
  });
});

describe("mainBottomNavMessengerTabHref", () => {
  it("레일별 메신저 목록 + from", () => {
    expect(mainBottomNavMessengerTabHref("delivery")).toContain("/community-messenger/delivery-chats");
    expect(mainBottomNavMessengerTabHref("delivery")).toContain("from=delivery");
    expect(mainBottomNavMessengerTabHref("trade")).toContain("/community-messenger/trade-chats");
    expect(mainBottomNavMessengerTabHref("trade")).toContain("from=trade");
    expect(mainBottomNavMessengerTabHref("community")).toContain("section=chats");
    expect(mainBottomNavMessengerTabHref("community")).toContain("from=community");
  });
});

describe("inferMessengerEntryOriginFromPath", () => {
  it("주문·배달 경로는 delivery", () => {
    expect(inferMessengerEntryOriginFromPath("/orders")).toBe("delivery");
    expect(inferMessengerEntryOriginFromPath("/my/store-orders")).toBe("delivery");
  });
});

describe("messengerEntryOriginToSecondaryRail", () => {
  it("from 과 하단 우측 레일 매핑", () => {
    expect(messengerEntryOriginToSecondaryRail("delivery")).toBe("stores");
    expect(messengerEntryOriginToSecondaryRail("trade")).toBe("trade");
    expect(messengerEntryOriginToSecondaryRail("community")).toBe("philife");
  });
});

describe("bottomNavMessengerHrefWithOrigin", () => {
  it("배달 표면에서 delivery-chats", () => {
    const href = bottomNavMessengerHrefWithOrigin("", "/stores", null);
    expect(href).toContain("delivery-chats");
    expect(href).toContain("from=delivery");
  });
});

describe("buildMessengerRoomListBackHref", () => {
  it("cm_list=delivery 는 메신저 배달 목록이 아닌 출처 탭으로", () => {
    expect(
      buildMessengerRoomListBackHref({
        get: (k) => (k === "cm_list" ? "delivery" : k === "from" ? "delivery" : null),
      })
    ).toBe("/stores");
  });

  it("cm_return 이 있으면 우선", () => {
    expect(
      buildMessengerRoomListBackHref({
        get: (k) =>
          k === "cm_return" ? "/orders?tab=active"
          : k === "cm_list" ? "delivery"
          : null,
      })
    ).toBe("/orders?tab=active");
  });
});

describe("shouldForceDirectDeliveryMessengerRoomBack", () => {
  it("배달 주문 방은 직행", () => {
    expect(
      shouldForceDirectDeliveryMessengerRoomBack({
        get: (k) => (k === "cm_list" ? "delivery" : null),
      })
    ).toBe(true);
  });
});
