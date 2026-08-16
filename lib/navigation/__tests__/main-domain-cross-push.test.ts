import { describe, expect, it } from "vitest";
import {
  isMainDomainCrossPush,
  resolveMainDomainId,
  shouldArmMainDomainTruePush,
} from "@/lib/navigation/main-domain-cross-push";
import { computeMainBottomNavPushAxis } from "@/lib/navigation/compute-main-bottom-nav-push-axis";
import { shouldMainBottomNavRouteScrollOnly } from "@/lib/main-menu/main-bottom-nav-route-commit";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("main domain cross push identity", () => {
  it("resolves five MAIN DOMAIN hubs", () => {
    expect(resolveMainDomainId("/philife")).toBe("community");
    expect(resolveMainDomainId("/")).toBe("community");
    expect(resolveMainDomainId("/market")).toBe("trade");
    expect(resolveMainDomainId("/stores")).toBe("delivery");
    expect(resolveMainDomainId("/community-messenger")).toBe("chat");
    expect(resolveMainDomainId("/mypage")).toBe("mypage");
  });

  it("detail routes stay inside domain identity", () => {
    expect(resolveMainDomainId("/philife/post/x")).toBe("community");
    expect(resolveMainDomainId("/post/abc")).toBe("trade");
    expect(resolveMainDomainId("/stores/browse/food")).toBe("delivery");
    expect(resolveMainDomainId("/community-messenger/rooms/r1")).toBe("chat");
    expect(resolveMainDomainId("/mypage/settings")).toBe("mypage");
  });

  const forward: Array<[string, string]> = [
    ["/philife", "/market"],
    ["/market", "/stores"],
    ["/stores", "/community-messenger"],
    ["/community-messenger", "/mypage"],
    ["/mypage", "/philife"],
  ];
  const reverse: Array<[string, string]> = [
    ["/market", "/philife"],
    ["/stores", "/market"],
    ["/community-messenger", "/stores"],
    ["/mypage", "/community-messenger"],
    ["/philife", "/mypage"],
  ];

  it.each([...forward, ...reverse])("cross push %s → %s", (from, to) => {
    expect(isMainDomainCrossPush(from, to)).toBe(true);
    expect(
      shouldArmMainDomainTruePush({
        fromPathname: from,
        toPathname: to,
        intentSource: "bottom-nav",
        reducedMotion: false,
      })
    ).toBe(true);
    expect(computeMainBottomNavPushAxis(from, to)).toBe("rtl");
  });

  it("same domain is not main-domain push", () => {
    expect(isMainDomainCrossPush("/philife", "/")).toBe(false);
    expect(isMainDomainCrossPush("/philife", "/community")).toBe(false);
    expect(isMainDomainCrossPush("/market", "/market/jobs")).toBe(false);
    expect(
      shouldArmMainDomainTruePush({
        fromPathname: "/philife",
        toPathname: "/philife",
        intentSource: "bottom-nav",
        reducedMotion: false,
      })
    ).toBe(false);
  });

  it("CASE D scroll_only same tab", () => {
    expect(shouldMainBottomNavRouteScrollOnly("/stores", "", "/stores")).toBe(true);
    expect(computeMainBottomNavPushAxis("/stores", "/stores")).toBeNull();
  });

  it("CASE E reduced motion skips arm", () => {
    expect(
      shouldArmMainDomainTruePush({
        fromPathname: "/philife",
        toPathname: "/market",
        intentSource: "bottom-nav",
        reducedMotion: true,
      })
    ).toBe(false);
  });

  it("trade-primary is not MAIN DOMAIN push", () => {
    expect(
      shouldArmMainDomainTruePush({
        fromPathname: "/market",
        toPathname: "/stores",
        intentSource: "trade-primary",
        reducedMotion: false,
      })
    ).toBe(false);
  });
});

describe("AppRouteTransition main-domain true push contract", () => {
  it("uses live children current panel + previous snapshot; no Instant enter panel", () => {
    const src = readFileSync(
      join(process.cwd(), "components/route-transition/AppRouteTransition.tsx"),
      "utf8"
    );
    expect(src).toContain("data-main-domain-previous");
    expect(src).toContain("data-main-domain-current");
    expect(src).toContain("data-main-domain-transition");
    expect(src).toContain("shouldArmMainDomainTruePush");
    expect(src).toContain("liveChildren");
    expect(src).not.toMatch(/function\s+InstantMainTabEnterPanel/);
    expect(src).toMatch(/MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES = new Set<string>\(\)/);
  });

  it("MainShellTabContentTransition keeps pendingPushNode null", () => {
    const src = readFileSync(
      join(process.cwd(), "components/layout/MainShellTabContentTransition.tsx"),
      "utf8"
    );
    expect(src).toContain("pendingPushNode={null}");
  });
});
