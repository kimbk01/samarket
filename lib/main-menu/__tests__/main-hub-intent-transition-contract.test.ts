/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("main hub intent transition contract", () => {
  it("Header mounts inside push surface (ONE transform authority)", () => {
    const shell = read("components/layout/ConditionalAppShell.tsx");
    expect(shell).toContain("hubChromeHeader=");
    expect(shell).toContain("MAIN_HUB_SCROLL_HEADER_CLASS");
    expect(shell).not.toMatch(/MainHubScrollColumn\s+header=\{/);
    const art = read("components/route-transition/AppRouteTransition.tsx");
    expect(art).toContain("hubChromeHeader");
    expect(art).toContain("{hubChromeHeader}");
    expect(art).toContain("data-main-hub-transition-surface");
  });

  it("BottomNav MAIN intent arms transition before pathname (START authority)", () => {
    const ctx = read("contexts/LatestMenuNavigationContext.tsx");
    expect(ctx).toContain("beginMainHubTransitionFromIntent");
    expect(ctx).toContain("shouldArmMainHubIntentTransition");
    const art = read("components/route-transition/AppRouteTransition.tsx");
    expect(art).toContain("applyMainHubPendingExit");
    expect(art).toContain("settleMainHubTransitionOnPathname");
    expect(art).toContain("subscribeMainHubTransition");
    expect(art).not.toContain("beginHubNewOnlyRtlEnter");
  });

  it("does not dual-panel push when hub header shares ONE transform surface", () => {
    const art = read("components/route-transition/AppRouteTransition.tsx");
    expect(art).toContain("hubChromeHeader");
    expect(art).toMatch(/hubChromeHeader[\s\S]*beginHubFallbackEnter/);
  });

  it("does not revive COVER overlay / dual-panel / frozen DOM", () => {
    const art = read("components/route-transition/AppRouteTransition.tsx");
    expect(art).toContain('MAIN_HUB_TRANSITION_KIND = "main-hub"');
    expect(art).toContain("MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES = new Set<string>()");
    expect(art).not.toContain("data-main-shell-cover-bg");
    const host = read("components/layout/MainShellTabContentTransition.tsx");
    expect(host).toContain("pendingPushNode={null}");
    expect(host).toContain("COVER abandoned");
  });

  it("Chat already-authed commits sync without parking axis behind requireAuthAction", () => {
    const nav = read("components/layout/BottomNav.tsx");
    expect(nav).toContain("getCurrentUser");
    expect(nav).toContain("peekAppBootProfile");
    expect(nav).toContain("isClientSignupComplete");
    expect(nav).toContain("setMainShellPushAxisIntent");
    expect(nav).toContain("DO NOT park beginMenuNavigation / cover axis behind await");
  });

  it("inactive MAIN hub Links enable Next prefetch", () => {
    const nav = read("components/layout/BottomNav.tsx");
    expect(nav).toContain("shouldPrefetchMainBottomNavHref");
    expect(nav).toContain("prefetch={shouldPrefetchMainBottomNavHref");
  });
});
