import { describe, expect, it } from "vitest";
import {
  isMainBottomNavHubEmphasisTab,
  resolveBuiltinTabHubDomain,
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
    /** `home` = 앱 홈(2026-11-09) — 허브 도메인 아님 */
    expect(resolveBuiltinTabHubDomain("home")).toBeNull();
    expect(resolveBuiltinTabHubDomain("stores")).toBe("stores");
    expect(resolveBuiltinTabHubDomain("chat")).toBeNull();
    expect(resolveBuiltinTabHubDomain("my")).toBeNull();
  });

  it("isMainBottomNavHubEmphasisTab", () => {
    expect(isMainBottomNavHubEmphasisTab("community", "philife")).toBe(true);
    /** 거래는 커뮤니티 안 탭 — 거래 도메인에서는 커뮤니티 탭이 강조 */
    expect(isMainBottomNavHubEmphasisTab("home", "trade")).toBe(false);
    expect(isMainBottomNavHubEmphasisTab("stores", "stores")).toBe(true);
    expect(isMainBottomNavHubEmphasisTab("community", "trade")).toBe(true);
    expect(isMainBottomNavHubEmphasisTab("chat", "philife")).toBe(false);
  });
});
