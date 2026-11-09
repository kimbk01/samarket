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

  it("D-1: tap keeps the current surface on screen; slide starts only at pathname settle", () => {
    const art = read("components/route-transition/AppRouteTransition.tsx");
    const start = art.indexOf("function applyMainHubPendingExit(");
    const pendingExit = art.slice(start, art.indexOf("\n}\n", start));
    /** 탭 순간 from-*(translate 100%) 금지 — RSC 대기 동안 헤더+본문이 화면 밖(흰 화면)이 되던 결함 */
    expect(pendingExit).not.toContain("classList.add(");
    expect(pendingExit).not.toContain("mainShellPushFromClassForAxis");
    expect(pendingExit).toContain("markMainHubTransitionFirstFrame(session.generation)");
    /** 경로 확정 때 같은 surface 에서 from → reflow → enter */
    const enterStart = art.indexOf("function applyMainHubEnter(");
    const enter = art.slice(enterStart, art.indexOf("\n}\n", enterStart));
    expect(enter).toMatch(/if \(!el\.classList\.contains\(fromClass\)\) \{[\s\S]*el\.classList\.add\(fromClass\);[\s\S]*void el\.offsetWidth;/);
    expect(enter).toContain("el.classList.add(enterClass)");
  });

  it("재감사: settle 이 mismatch 면 세션을 끝내고(finalize) 표식을 정리한다", () => {
    const art = read("components/route-transition/AppRouteTransition.tsx");
    const i = art.indexOf('if (settle === "mismatch") {');
    expect(i).toBeGreaterThan(-1);
    const block = art.slice(i, art.indexOf('} else if (settle === "stale")', i));
    expect(block).toContain("forceMainHubSurfaceCleanup(el);");
    expect(block).toContain("finalizeMainHubTransition(activeHub.generation);");
    expect(block).not.toContain("return undefined");
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
