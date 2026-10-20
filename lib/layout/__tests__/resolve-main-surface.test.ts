import { describe, expect, it } from "vitest";
import {
  COMMUNITY_HOME_SURFACE_PATHS,
  isCommunityHomeSurfacePath,
  isMainTabKeepAliveHubPath,
  resolveMainSurface,
  resolveMainTabKeepAliveHub,
} from "@/lib/layout/resolve-main-surface";
import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";

describe("resolveMainSurface", () => {
  it("maps community home hubs to community", () => {
    expect(resolveMainSurface("/")).toBe("community");
    expect(resolveMainSurface("/philife")).toBe("community");
    expect(resolveMainSurface("/community")).toBe("community");
    expect(resolveMainSurface("/home")).toBe("community");
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
    expect(isCommunityHomeSurfacePath("/")).toBe(true);
    expect(isCommunityHomeSurfacePath("/philife")).toBe(true);
    expect(isCommunityHomeSurfacePath("/community")).toBe(true);
    expect(isCommunityHomeSurfacePath("/home")).toBe(true);
    expect(isCommunityHomeSurfacePath("/home/")).toBe(true);
    expect(isCommunityHomeSurfacePath("/home?x=1")).toBe(true);
    expect(isCommunityHomeSurfacePath("/community-messenger")).toBe(false);
    expect(isCommunityHomeSurfacePath("/philife/post/x")).toBe(false);
    expect(isCommunityHomeSurfacePath("/market")).toBe(false);
  });
});

describe("resolveMainTabKeepAliveHub", () => {
  it("exact bottom-tab hubs only", () => {
    expect(resolveMainTabKeepAliveHub("/")).toBe("community");
    expect(resolveMainTabKeepAliveHub("/philife")).toBe("community");
    expect(resolveMainTabKeepAliveHub("/home")).toBe("community");
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
  it("`/` is Community, not Trade floating surface", () => {
    expect(isTradeFloatingMenuSurface("/")).toBe(false);
    expect(isTradeFloatingMenuSurface("/philife")).toBe(false);
    expect(isTradeFloatingMenuSurface("/market")).toBe(true);
  });
});

describe("COMMUNITY_HOME_SURFACE_PATHS", () => {
  it("is the single hub-root list (Cold Boot `/home` alias included)", () => {
    expect([...COMMUNITY_HOME_SURFACE_PATHS].sort()).toEqual(["/", "/community", "/home", "/philife"]);
    for (const p of COMMUNITY_HOME_SURFACE_PATHS) expect(isCommunityHomeSurfacePath(p)).toBe(true);
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
    expect(isPhilifeConsumerBottomNavSurface("/home")).toBe(true);
    expect(isBottomNavTabActive("/home", "/philife")).toBe(true);
    expect(resolveBottomNavScrollHideEnabled("/home", false)).toBe(resolveBottomNavScrollHideEnabled("/", false));
    expect(isPhilifeFeedHubPath("/home")).toBe(true);
    expect(isCommunityHubRootPath("/home")).toBe(true);
    expect(mainBottomNavPrefetchTriggerKey("/home")).toBe("philife");
    expect(resolveCanonicalNavIndex("/home")).toBe(resolveCanonicalNavIndex("/"));
  });
});
