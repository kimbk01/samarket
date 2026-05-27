import { describe, expect, it } from "vitest";
import {
  isMainBottomNavHubEmphasisTab,
  requiresCrossDomainConfirm,
  resolveBuiltinTabHubDomain,
  resolveCrossDomainConfirmCopy,
  resolveMainBottomNavHubDomain,
} from "@/lib/main-menu/main-bottom-nav-domain";

describe("main-bottom-nav-domain", () => {
  it("resolveMainBottomNavHubDomain", () => {
    expect(resolveMainBottomNavHubDomain("/philife")).toBe("philife");
    expect(resolveMainBottomNavHubDomain("/market")).toBe("trade");
    expect(resolveMainBottomNavHubDomain("/stores")).toBe("stores");
    expect(resolveMainBottomNavHubDomain("/orders")).toBe("stores");
    expect(resolveMainBottomNavHubDomain("/community-messenger")).toBeNull();
    expect(resolveMainBottomNavHubDomain("/mypage")).toBeNull();
  });

  it("resolveBuiltinTabHubDomain", () => {
    expect(resolveBuiltinTabHubDomain("community")).toBe("philife");
    expect(resolveBuiltinTabHubDomain("home")).toBe("trade");
    expect(resolveBuiltinTabHubDomain("stores")).toBe("stores");
    expect(resolveBuiltinTabHubDomain("chat")).toBeNull();
    expect(resolveBuiltinTabHubDomain("my")).toBeNull();
  });

  it("isMainBottomNavHubEmphasisTab", () => {
    expect(isMainBottomNavHubEmphasisTab("community", "philife")).toBe(true);
    expect(isMainBottomNavHubEmphasisTab("home", "trade")).toBe(true);
    expect(isMainBottomNavHubEmphasisTab("stores", "stores")).toBe(true);
    expect(isMainBottomNavHubEmphasisTab("community", "trade")).toBe(false);
    expect(isMainBottomNavHubEmphasisTab("chat", "philife")).toBe(false);
  });

  it("requiresCrossDomainConfirm — chat·my·레거시 chat 슬롯 면제", () => {
    expect(requiresCrossDomainConfirm("/stores", "chat")).toBe(false);
    expect(requiresCrossDomainConfirm("/stores", "my")).toBe(false);
    expect(requiresCrossDomainConfirm("/stores", "delivery-order-chat")).toBe(false);
  });

  it("requiresCrossDomainConfirm — 3대 허브 교차만", () => {
    expect(requiresCrossDomainConfirm("/stores", "community")).toBe(true);
    expect(requiresCrossDomainConfirm("/stores", "home")).toBe(true);
    expect(requiresCrossDomainConfirm("/stores", "stores")).toBe(false);
    expect(requiresCrossDomainConfirm("/stores", "chat")).toBe(false);
    expect(requiresCrossDomainConfirm("/stores", "my")).toBe(false);
    expect(requiresCrossDomainConfirm("/market", "community")).toBe(true);
    expect(requiresCrossDomainConfirm("/philife", "home")).toBe(true);
  });

  it("requiresCrossDomainConfirm — messenger에서 허브 탭", () => {
    expect(requiresCrossDomainConfirm("/community-messenger", "stores")).toBe(true);
    expect(requiresCrossDomainConfirm("/community-messenger", "chat")).toBe(false);
  });

  it("resolveCrossDomainConfirmCopy", () => {
    expect(resolveCrossDomainConfirmCopy("/market", "community")).toEqual({
      kind: "from_to",
      fromLabelKey: "nav_bottom_trade",
      toLabelKey: "nav_bottom_community",
    });
    expect(resolveCrossDomainConfirmCopy("/community-messenger", "stores")).toEqual({
      kind: "to_only",
      toLabelKey: "nav_bottom_delivery",
    });
    expect(resolveCrossDomainConfirmCopy("/stores", "chat")).toBeNull();
  });
});
