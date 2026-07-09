import { describe, expect, it } from "vitest";
import { resolveMessengerChatFilters } from "@/lib/community-messenger/messenger-ia";
import {
  bottomNavMessengerHrefWithOrigin,
  buildMessengerRoomListBackHref,
  inferMessengerEntryOriginFromPath,
  mainBottomNavGlobalInboxTabHref,
  mainBottomNavMessengerTabHref,
  messengerEntryOriginBackHref,
  messengerEntryOriginToSecondaryRail,
  resolveMessengerHomeTier1BackHref,
  shouldForceDirectDeliveryMessengerRoomBack,
} from "@/lib/community-messenger/messenger-entry-origin";

describe("resolveMessengerHomeTier1BackHref", () => {
  it("채팅홈은 출처 탭으로", () => {
    expect(
      resolveMessengerHomeTier1BackHref({
        pillar: null,
        mainSection: "chats",
        origin: "delivery",
      })
    ).toBe("/stores");
  });

  it("FAB 섹션(친구·모임·보관함·통화목록)은 채팅 인박스로", () => {
    for (const mainSection of ["friends", "open_chat", "archive", "call_logs"] as const) {
      const href = resolveMessengerHomeTier1BackHref({
        pillar: null,
        mainSection,
        origin: "delivery",
      });
      expect(href).toContain("/community-messenger");
      expect(href).toContain("section=chats");
      expect(href).toContain("from=delivery");
      expect(href).not.toBe("/stores");
    }
  });

  it("from=delivery 직접 진입 — kind 미지정 시 인박스는 kind=all(pillar 행 노출)", () => {
    const { kind } = resolveMessengerChatFilters(undefined, undefined, undefined);
    expect(kind).toBe("all");
  });

  it("거래/배달 묶음 서브 라우트는 채팅 인박스로", () => {
    expect(
      resolveMessengerHomeTier1BackHref({
        pillar: "delivery",
        mainSection: "chats",
        origin: "delivery",
      })
    ).toContain("section=chats");
  });
});

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
  it("배달 표면에서도 전체 인박스(section=chats)", () => {
    const href = bottomNavMessengerHrefWithOrigin("", "/stores", null);
    expect(href).toContain("section=chats");
    expect(href).not.toContain("delivery-chats");
    expect(href).toContain("from=delivery");
  });
});

describe("mainBottomNavGlobalInboxTabHref", () => {
  it("하단 탭 chat — 도메인과 무관하게 전체 인박스", () => {
    const href = mainBottomNavGlobalInboxTabHref("/stores", null);
    expect(href).toContain("/community-messenger");
    expect(href).toContain("section=chats");
    expect(href).not.toContain("delivery-chats");
  });
});

describe("buildMessengerRoomListBackHref", () => {
  it("cm_list=delivery 는 주문 채팅방 리스트로", () => {
    expect(
      buildMessengerRoomListBackHref({
        get: (k) => (k === "cm_list" ? "delivery" : k === "from" ? "delivery" : null),
      })
    ).toContain("/community-messenger/delivery-chats");
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
  it("배달 주문 방도 history back 허용", () => {
    expect(
      shouldForceDirectDeliveryMessengerRoomBack({
        get: (k) => (k === "cm_list" ? "delivery" : null),
      })
    ).toBe(false);
  });
});
