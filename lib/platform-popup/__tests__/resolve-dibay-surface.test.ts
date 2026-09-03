import { describe, expect, it } from "vitest";
import {
  isPlatformPopupAdvertisingSurface,
  resolveDibaySurface,
} from "@/lib/platform-popup/resolve-dibay-surface";
import {
  isPlatformPopupAdminCriticalPath,
  isPlatformPopupOwnerCriticalPath,
} from "@/lib/platform-popup/popup-critical-path-gates";
import { expandPlatformPopupGlobalSurfaces } from "@/lib/platform-popup/surfaces";
import { PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS } from "@/lib/platform-popup/admin-surface-target-mode";

describe("resolveDibaySurface — surface SSOT (Admin/Owner selectable)", () => {
  it("maps COMMUNITY / TRADE / DELIVERY / MYPAGE", () => {
    expect(resolveDibaySurface("/philife")).toBe("COMMUNITY");
    expect(resolveDibaySurface("/market")).toBe("TRADE");
    expect(resolveDibaySurface("/stores")).toBe("DELIVERY");
    expect(resolveDibaySurface("/mypage")).toBe("MYPAGE");
  });

  it("maps ADMIN as advertising surface (not always-excluded)", () => {
    expect(resolveDibaySurface("/admin")).toBe("ADMIN");
    expect(resolveDibaySurface("/admin/platform-popup")).toBe("ADMIN");
    expect(isPlatformPopupAdvertisingSurface("ADMIN")).toBe(true);
  });

  it("maps Delivery Owner as DELIVERY_OWNER (not OWNER_OPS)", () => {
    expect(resolveDibaySurface("/stores/owner")).toBe("DELIVERY_OWNER");
    expect(resolveDibaySurface("/stores/owner/orders")).toBe("DELIVERY_OWNER");
    expect(resolveDibaySurface("/my/business")).toBe("DELIVERY_OWNER");
    expect(isPlatformPopupAdvertisingSurface("DELIVERY_OWNER")).toBe(true);
  });

  it("Admin finance paths are critical PAYMENT, not ADMIN ads", () => {
    expect(resolveDibaySurface("/admin/finance")).toBe("PAYMENT");
    expect(resolveDibaySurface("/admin/store-settlements")).toBe("PAYMENT");
    expect(isPlatformPopupAdminCriticalPath("/admin/point-charges")).toBe(true);
  });

  it("Owner finance/ads/settlements are critical PAYMENT", () => {
    expect(resolveDibaySurface("/stores/owner/finance")).toBe("PAYMENT");
    expect(resolveDibaySurface("/stores/owner/settlements")).toBe("PAYMENT");
    expect(resolveDibaySurface("/stores/owner/ads")).toBe("PAYMENT");
    expect(isPlatformPopupOwnerCriticalPath("/stores/owner/ads/new")).toBe(true);
  });

  it("excludes MESSENGER / ORDER_CRITICAL / CALL", () => {
    expect(resolveDibaySurface("/community-messenger")).toBe("MESSENGER");
    expect(resolveDibaySurface("/stores/cart")).toBe("ORDER_CRITICAL");
    expect(resolveDibaySurface("/market", { callIncoming: true })).toBe("CALL");
    expect(isPlatformPopupAdvertisingSurface("MESSENGER")).toBe(false);
  });

  it("GLOBAL expands to six consumer surfaces", () => {
    expect([...expandPlatformPopupGlobalSurfaces()]).toEqual([
      "COMMUNITY",
      "TRADE",
      "DELIVERY",
      "DELIVERY_OWNER",
      "ADMIN",
      "MYPAGE",
    ]);
  });

  it("Admin/Owner radio exposes seven modes", () => {
    expect(PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS.map((o) => o.mode)).toEqual([
      "GLOBAL",
      "COMMUNITY",
      "TRADE",
      "DELIVERY",
      "DELIVERY_OWNER",
      "ADMIN",
      "MYPAGE",
    ]);
  });
});
