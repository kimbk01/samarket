import { describe, expect, it } from "vitest";
import {
  isPlatformPopupAdvertisingSurface,
  resolveDibaySurface,
} from "@/lib/platform-popup/resolve-dibay-surface";

describe("resolveDibaySurface — CUT 1 surface SSOT", () => {
  it("maps COMMUNITY", () => {
    expect(resolveDibaySurface("/philife")).toBe("COMMUNITY");
    expect(resolveDibaySurface("/philife/post/abc")).toBe("COMMUNITY");
    expect(resolveDibaySurface("/community/posts/x")).toBe("COMMUNITY");
  });

  it("maps TRADE", () => {
    expect(resolveDibaySurface("/market")).toBe("TRADE");
    expect(resolveDibaySurface("/market/electronics")).toBe("TRADE");
    expect(resolveDibaySurface("/dibamarket")).toBe("TRADE");
    expect(resolveDibaySurface("/post/123")).toBe("TRADE");
  });

  it("maps DELIVERY", () => {
    expect(resolveDibaySurface("/stores")).toBe("DELIVERY");
    expect(resolveDibaySurface("/stores/browse/food")).toBe("DELIVERY");
    expect(resolveDibaySurface("/delivery/search")).toBe("DELIVERY");
  });

  it("maps MYPAGE", () => {
    expect(resolveDibaySurface("/mypage")).toBe("MYPAGE");
    expect(resolveDibaySurface("/mypage/profile")).toBe("MYPAGE");
    expect(resolveDibaySurface("/my/points")).toBe("MYPAGE");
  });

  it("excludes MESSENGER", () => {
    expect(resolveDibaySurface("/community-messenger")).toBe("MESSENGER");
    expect(resolveDibaySurface("/community-messenger/rooms/r1")).toBe("MESSENGER");
    expect(resolveDibaySurface("/mypage/trade/chat/r1")).toBe("MESSENGER");
  });

  it("excludes ADMIN", () => {
    expect(resolveDibaySurface("/admin")).toBe("ADMIN");
    expect(resolveDibaySurface("/admin/stores")).toBe("ADMIN");
  });

  it("excludes OWNER_OPS", () => {
    expect(resolveDibaySurface("/stores/owner")).toBe("OWNER_OPS");
    expect(resolveDibaySurface("/stores/owner/orders")).toBe("OWNER_OPS");
    expect(resolveDibaySurface("/my/business")).toBe("OWNER_OPS");
  });

  it("excludes ORDER_CRITICAL pathnames", () => {
    expect(resolveDibaySurface("/stores/cart")).toBe("ORDER_CRITICAL");
    expect(resolveDibaySurface("/orders/store/oid")).toBe("ORDER_CRITICAL");
    expect(resolveDibaySurface("/stores/acme/order/complete")).toBe("ORDER_CRITICAL");
  });

  it("CALL context wins over pathname", () => {
    expect(resolveDibaySurface("/market", { callIncoming: true })).toBe("CALL");
    expect(resolveDibaySurface("/philife", { callActive: true })).toBe("CALL");
    expect(resolveDibaySurface("/stores", { nativeCallTransition: true })).toBe("CALL");
  });

  it("only consumer surfaces are advertising-eligible", () => {
    expect(isPlatformPopupAdvertisingSurface("TRADE")).toBe(true);
    expect(isPlatformPopupAdvertisingSurface("MESSENGER")).toBe(false);
    expect(isPlatformPopupAdvertisingSurface("CALL")).toBe(false);
    expect(isPlatformPopupAdvertisingSurface("ADMIN")).toBe(false);
    expect(isPlatformPopupAdvertisingSurface("ORDER_CRITICAL")).toBe(false);
  });
});
