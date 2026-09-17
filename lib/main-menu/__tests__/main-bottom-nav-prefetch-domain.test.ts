import { describe, expect, it } from "vitest";
import { mainBottomNavPrefetchTriggerKey } from "@/lib/main-menu/main-bottom-nav-prefetch-domain";
import { resolveMainBottomNavHubDomain } from "@/lib/main-menu/main-bottom-nav-domain";

describe("mainBottomNavPrefetchTriggerKey", () => {
  it("같은 하단 도메인 안에서는 pathname 이 바뀌어도 동일 키", () => {
    expect(mainBottomNavPrefetchTriggerKey("/philife")).toBe("philife");
    expect(mainBottomNavPrefetchTriggerKey("/philife/abc")).toBe("philife");
    expect(mainBottomNavPrefetchTriggerKey("/philife/abc/")).toBe("philife");
    expect(mainBottomNavPrefetchTriggerKey("/philife/my")).toBe("philife");
  });

  it("거래 허브·마켓·상품 상세는 trade (list↔detail 동일 셸 도메인)", () => {
    expect(mainBottomNavPrefetchTriggerKey("/market")).toBe("trade");
    expect(mainBottomNavPrefetchTriggerKey("/market/jobs")).toBe("trade");
    expect(mainBottomNavPrefetchTriggerKey("/post")).toBe("trade");
    expect(mainBottomNavPrefetchTriggerKey("/post/abc")).toBe("trade");
    expect(mainBottomNavPrefetchTriggerKey("/post/abc/")).toBe("trade");
    expect(mainBottomNavPrefetchTriggerKey("/market")).toBe(
      mainBottomNavPrefetchTriggerKey("/post/abc")
    );
  });

  it("Trade list↔detail 는 셸 도메인 전환이 아니다 (shell top reset 금지)", () => {
    const list = mainBottomNavPrefetchTriggerKey("/market");
    const detail = mainBottomNavPrefetchTriggerKey("/post/362b8855-9871-47d8-a2c0-bf774ee10423");
    expect(list).toBe("trade");
    expect(detail).toBe("trade");
    expect(list).toBe(detail);
    expect(resolveMainBottomNavHubDomain("/post/abc")).toBe("trade");
  });

  it("실제 bottom-nav 도메인 이탈은 키가 바뀐다", () => {
    expect(mainBottomNavPrefetchTriggerKey("/market")).not.toBe(
      mainBottomNavPrefetchTriggerKey("/stores")
    );
    expect(mainBottomNavPrefetchTriggerKey("/post/abc")).not.toBe(
      mainBottomNavPrefetchTriggerKey("/philife")
    );
    expect(mainBottomNavPrefetchTriggerKey("/post/abc")).not.toBe(
      mainBottomNavPrefetchTriggerKey("/mypage")
    );
  });

  it("레거시 /community 는 필라이프와 동일 도메인 (Community post ≠ /post)", () => {
    expect(mainBottomNavPrefetchTriggerKey("/community")).toBe("philife");
    expect(mainBottomNavPrefetchTriggerKey("/community/post/x")).toBe("philife");
    expect(mainBottomNavPrefetchTriggerKey("/community/post/x")).not.toBe(
      mainBottomNavPrefetchTriggerKey("/post/x")
    );
    expect(mainBottomNavPrefetchTriggerKey("/community-messenger")).toBe("messenger");
  });

  it("메신저·마이·배달·기타", () => {
    expect(mainBottomNavPrefetchTriggerKey("/community-messenger")).toBe("messenger");
    expect(mainBottomNavPrefetchTriggerKey("/community-messenger/rooms/x")).toBe("messenger");
    expect(mainBottomNavPrefetchTriggerKey("/mypage")).toBe("my");
    expect(mainBottomNavPrefetchTriggerKey("/mypage/x")).toBe("my");
    expect(mainBottomNavPrefetchTriggerKey("/my")).toBe("my");
    expect(mainBottomNavPrefetchTriggerKey("/orders")).toBe("stores");
    expect(mainBottomNavPrefetchTriggerKey("/orders/store/x")).toBe("stores");
    expect(mainBottomNavPrefetchTriggerKey("/mypage/store-orders")).toBe("stores");
    expect(mainBottomNavPrefetchTriggerKey("/my/store-orders")).toBe("stores");
    expect(mainBottomNavPrefetchTriggerKey("/stores/cart")).toBe("stores");
    expect(mainBottomNavPrefetchTriggerKey("/stores")).toBe("stores");
    expect(mainBottomNavPrefetchTriggerKey("/stores/slug")).toBe("stores");
    expect(mainBottomNavPrefetchTriggerKey("/products/1")).toBe("other");
  });
});

describe("ConditionalAppShell domain-change scroll gate (contract)", () => {
  it("Trade list → Trade detail: domain unchanged → shell top NOT triggered", () => {
    const prev = mainBottomNavPrefetchTriggerKey("/market");
    const next = mainBottomNavPrefetchTriggerKey("/post/abc");
    expect(prev === next).toBe(true);
  });

  it("Trade detail → Trade list: domain unchanged → shell top NOT triggered", () => {
    const prev = mainBottomNavPrefetchTriggerKey("/post/abc");
    const next = mainBottomNavPrefetchTriggerKey("/market");
    expect(prev === next).toBe(true);
  });

  it("Trade → stores: domain changes → shell top PRESERVED", () => {
    const prev = mainBottomNavPrefetchTriggerKey("/market");
    const next = mainBottomNavPrefetchTriggerKey("/stores");
    expect(prev !== next).toBe(true);
  });
});
