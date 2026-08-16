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
});
