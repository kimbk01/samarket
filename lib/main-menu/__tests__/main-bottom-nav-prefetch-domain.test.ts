import { describe, expect, it } from "vitest";
import { mainBottomNavPrefetchTriggerKey } from "@/lib/main-menu/main-bottom-nav-prefetch-domain";

describe("mainBottomNavPrefetchTriggerKey", () => {
  it("같은 하단 도메인 안에서는 pathname 이 바뀌어도 동일 키", () => {
    expect(mainBottomNavPrefetchTriggerKey("/philife")).toBe("philife");
    expect(mainBottomNavPrefetchTriggerKey("/philife/abc")).toBe("philife");
    expect(mainBottomNavPrefetchTriggerKey("/philife/abc/")).toBe("philife");
    expect(mainBottomNavPrefetchTriggerKey("/philife/my")).toBe("philife");
  });

  it("거래 허브·마켓은 trade", () => {
    expect(mainBottomNavPrefetchTriggerKey("/home")).toBe("trade");
    expect(mainBottomNavPrefetchTriggerKey("/market")).toBe("trade");
    expect(mainBottomNavPrefetchTriggerKey("/market/jobs")).toBe("trade");
  });

  it("메신저·마이·배달·기타", () => {
    expect(mainBottomNavPrefetchTriggerKey("/community-messenger")).toBe("messenger");
    expect(mainBottomNavPrefetchTriggerKey("/community-messenger/rooms/x")).toBe("messenger");
    expect(mainBottomNavPrefetchTriggerKey("/mypage")).toBe("my");
    expect(mainBottomNavPrefetchTriggerKey("/mypage/x")).toBe("my");
    expect(mainBottomNavPrefetchTriggerKey("/my")).toBe("my");
    expect(mainBottomNavPrefetchTriggerKey("/my/store-orders")).toBe("my");
    expect(mainBottomNavPrefetchTriggerKey("/stores")).toBe("stores");
    expect(mainBottomNavPrefetchTriggerKey("/stores/slug")).toBe("stores");
    expect(mainBottomNavPrefetchTriggerKey("/products/1")).toBe("other");
  });
});
