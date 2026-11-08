import { describe, expect, it } from "vitest";
import {
  COMMUNITY_HOME_SURFACE_PATHS,
  HOME_SURFACE_PATHS,
  isCommunityHomeSurfacePath,
  isHomeSurfacePath,
  isMainTabKeepAliveHubPath,
  resolveMainSurface,
  resolveMainTabKeepAliveHub,
} from "@/lib/layout/resolve-main-surface";
import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";

describe("resolveMainSurface", () => {
  it("maps app home `/`·`/home` to home (2026-11-09) and community hubs to community", () => {
    expect(resolveMainSurface("/")).toBe("home");
    expect(resolveMainSurface("/home")).toBe("home");
    expect(resolveMainSurface("/philife")).toBe("community");
    expect(resolveMainSurface("/community")).toBe("community");
    expect(resolveMainSurface("/philife/post/x")).toBe("community");
  });

  it("does not treat /home-like prefixes as community", () => {
    expect(resolveMainSurface("/homes")).toBe("other");
    expect(resolveMainSurface("/home/x")).toBe("other");
  });

  it("does not treat messenger as community prefix", () => {
    expect(resolveMainSurface("/community-messenger")).toBe("chat");
    expect(resolveMainSurface("/community-messenger/rooms/abc")).toBe("chat");
  });

  it("maps trade hubs", () => {
    expect(resolveMainSurface("/market")).toBe("trade");
    expect(resolveMainSurface("/market/jobs")).toBe("trade");
    expect(resolveMainSurface("/post/abc")).toBe("trade");
  });

  it("maps delivery / chat / mypage", () => {
    expect(resolveMainSurface("/stores")).toBe("delivery");
    expect(resolveMainSurface("/mypage")).toBe("mypage");
  });
});

describe("isCommunityHomeSurfacePath", () => {
  it("only home hubs", () => {
    expect(isCommunityHomeSurfacePath("/")).toBe(false);
    expect(isCommunityHomeSurfacePath("/philife")).toBe(true);
    expect(isCommunityHomeSurfacePath("/community")).toBe(true);
    expect(isCommunityHomeSurfacePath("/home")).toBe(false);
    expect(isHomeSurfacePath("/")).toBe(true);
    expect(isHomeSurfacePath("/home")).toBe(true);
    expect(isHomeSurfacePath("/home/")).toBe(true);
    expect(isHomeSurfacePath("/home?x=1")).toBe(true);
    expect(isHomeSurfacePath("/philife")).toBe(false);
    expect(isCommunityHomeSurfacePath("/community-messenger")).toBe(false);
    expect(isCommunityHomeSurfacePath("/philife/post/x")).toBe(false);
    expect(isCommunityHomeSurfacePath("/market")).toBe(false);
  });
});

describe("resolveMainTabKeepAliveHub", () => {
  it("exact bottom-tab hubs only", () => {
    expect(resolveMainTabKeepAliveHub("/")).toBe("home");
    expect(resolveMainTabKeepAliveHub("/philife")).toBe("community");
    expect(resolveMainTabKeepAliveHub("/home")).toBe("home");
    expect(resolveMainTabKeepAliveHub("/community")).toBe("community");
    expect(resolveMainTabKeepAliveHub("/market")).toBe("trade");
    expect(resolveMainTabKeepAliveHub("/stores")).toBe("delivery");
    expect(resolveMainTabKeepAliveHub("/community-messenger")).toBe("chat");
    expect(resolveMainTabKeepAliveHub("/mypage")).toBe("mypage");
    expect(resolveMainTabKeepAliveHub("/philife/post/x")).toBe(null);
    expect(resolveMainTabKeepAliveHub("/market/jobs")).toBe(null);
    expect(resolveMainTabKeepAliveHub("/community-messenger/rooms/a")).toBe(null);
    expect(isMainTabKeepAliveHubPath("/market")).toBe(true);
    expect(isMainTabKeepAliveHubPath("/market/jobs")).toBe(false);
  });
});

describe("isTradeFloatingMenuSurface — Cold Boot / must not be trade", () => {
  it("`/` is the app home, not Trade floating surface", () => {
    expect(isTradeFloatingMenuSurface("/")).toBe(false);
    expect(isTradeFloatingMenuSurface("/philife")).toBe(false);
    expect(isTradeFloatingMenuSurface("/market")).toBe(true);
  });
});

describe("COMMUNITY_HOME_SURFACE_PATHS", () => {
  it("is the single hub-root list; app home is a separate list (2026-11-09)", () => {
    expect([...COMMUNITY_HOME_SURFACE_PATHS].sort()).toEqual(["/community", "/philife"]);
    expect([...HOME_SURFACE_PATHS].sort()).toEqual(["/", "/home"]);
    for (const p of COMMUNITY_HOME_SURFACE_PATHS) expect(isCommunityHomeSurfacePath(p)).toBe(true);
    for (const p of HOME_SURFACE_PATHS) expect(isHomeSurfacePath(p)).toBe(true);
  });
});

describe("/home parity with `/` (§13-1)", () => {
  it("same tier1 rules, bottom-nav, scroll-hide and feed-hub flags", async () => {
    const { getMobileTopTier1RuleSet } = await import("@/lib/layout/mobile-top-tier1-rules");
    const { resolveMainTier1Subpage } = await import("@/lib/layout/resolve-main-tier1");
    const { isPhilifeConsumerBottomNavSurface } = await import("@/lib/main-menu/philife-bottom-nav-layout");
    const { isBottomNavTabActive } = await import("@/lib/main-menu/main-bottom-nav-prefetch-pick");
    const { resolveBottomNavScrollHideEnabled } = await import("@/lib/layout/use-bottom-nav-scroll-hide-behavior");
    const { isPhilifeFeedHubPath } = await import("@/lib/philife/philife-hub-path");
    const { isCommunityHubRootPath } = await import("@/lib/community/community-hub-state");
    const { mainBottomNavPrefetchTriggerKey } = await import("@/lib/main-menu/main-bottom-nav-prefetch-domain");
    const { resolveCanonicalNavIndex } = await import("@/components/route-transition/route-transition-config");
    const home = getMobileTopTier1RuleSet("/home");
    const root = getMobileTopTier1RuleSet("/");
    expect(home).toEqual(root);
    expect(resolveMainTier1Subpage("/home")).toBeNull();
    /** 앱 홈은 자체 녹색 헤더 — 공통 1단 끔 */
    expect(home.showRegionBar).toBe(false);
    expect(isPhilifeConsumerBottomNavSurface("/home")).toBe(isPhilifeConsumerBottomNavSurface("/"));
    expect(isBottomNavTabActive("/home", "/home")).toBe(true);
    expect(isBottomNavTabActive("/", "/home")).toBe(true);
    expect(isBottomNavTabActive("/home", "/philife")).toBe(false);
    expect(resolveBottomNavScrollHideEnabled("/home", false)).toBe(resolveBottomNavScrollHideEnabled("/", false));
    expect(isPhilifeFeedHubPath("/home")).toBe(isPhilifeFeedHubPath("/"));
    expect(isCommunityHubRootPath("/home")).toBe(isCommunityHubRootPath("/"));
    expect(mainBottomNavPrefetchTriggerKey("/home")).toBe("root");
    expect(mainBottomNavPrefetchTriggerKey("/")).toBe("root");
    expect(resolveCanonicalNavIndex("/home")).toBe(resolveCanonicalNavIndex("/"));
  });
});
