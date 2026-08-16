/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeMainBottomNavPushAxis } from "@/lib/navigation/compute-main-bottom-nav-push-axis";
import { BOTTOM_NAV_HISTORY_MODE, mainBottomNavRouteUsesReplace } from "@/lib/main-menu/main-bottom-nav-route-commit";
import { resolveMainSurface } from "@/lib/layout/resolve-main-surface";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const MAIN_ROOTS = [
  ["/philife", "community"],
  ["/market", "trade"],
  ["/stores", "delivery"],
  ["/community-messenger", "chat"],
  ["/mypage", "mypage"],
] as const;

describe("BottomNav 5-domain SSOT cutover contract", () => {
  it("canonical surfaces map 5 MAIN roots", () => {
    for (const [path, id] of MAIN_ROOTS) {
      expect(resolveMainSurface(path)).toBe(id);
    }
  });

  it("BOTTOM_NAV_ITEMS cover 5 tab ids", () => {
    expect(BOTTOM_NAV_ITEMS.map((t) => t.id).sort()).toEqual(
      ["chat", "community", "home", "my", "stores"].sort()
    );
  });

  it("20-way different MAIN pairs are always rtl", () => {
    const paths = MAIN_ROOTS.map(([p]) => p);
    for (const from of paths) {
      for (const to of paths) {
        if (from === to) {
          expect(computeMainBottomNavPushAxis(from, to)).toBeNull();
        } else {
          expect(computeMainBottomNavPushAxis(from, to)).toBe("rtl");
        }
      }
    }
  });

  it("history mode is replace-only", () => {
    expect(BOTTOM_NAV_HISTORY_MODE).toBe("replace");
    expect(mainBottomNavRouteUsesReplace("/market", "/stores")).toBe(true);
  });

  it("BottomNav has no MAIN confirm popup and Chat uses commit not bare push", () => {
    const src = read("components/layout/BottomNav.tsx");
    expect(src).not.toContain("resolveBottomNavTransitionConfirmCopy");
    expect(src).not.toContain("MainBottomNavDomainTransitionDialog");
    expect(src).not.toContain("router.push(targetHref)");
    expect(src).toContain('requireAuthAction("messenger_open"');
    expect(src).toContain("commitBottomNavTabRoute");
    expect(src).toContain("commitMainBottomNavRoute");
  });

  it("confirm copy/dialog modules deleted", () => {
    expect(() => read("lib/navigation/main-bottom-nav-transition-copy.ts")).toThrow();
    expect(() => read("lib/navigation/main-bottom-nav-domain-transition-dialog.tsx")).toThrow();
  });

  it("BottomNav MAIN View Transition product branch absent", () => {
    expect(() => read("lib/navigation/bottom-nav-main-view-transition.ts")).toThrow();
    expect(() => read("app/bottom-nav-main-view-transition.css")).toThrow();
    const commit = read("lib/main-menu/main-bottom-nav-route-commit.ts");
    expect(commit).not.toContain("startViewTransition");
    expect(commit).not.toContain("shouldPrototypeBottomNavMainViewTransition");
    expect(commit).not.toContain("__DIBAY_BN_VT_TRACE__");
    const globals = read("app/globals.css");
    expect(globals).not.toContain("bottom-nav-main-view-transition.css");
    const bridge = read("lib/navigation/pending-menu-navigation-bridge.ts");
    expect(bridge).not.toContain("notifyMainShellPathnameLayoutCommit");
    expect(bridge).not.toContain("waitMainShellPathnameLayoutCommit");
    const art = read("components/route-transition/AppRouteTransition.tsx");
    expect(art).not.toContain("notifyMainShellPathnameLayoutCommit");
  });
});
