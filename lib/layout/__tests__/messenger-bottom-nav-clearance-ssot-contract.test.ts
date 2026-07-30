import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isMainBottomNavHubBodyClearancePath } from "@/lib/layout/main-bottom-nav-hub-clearance";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { isBottomNavEligibleRoute, shouldRenderMainBottomNav } from "@/lib/navigation/bottom-nav-route-policy";
import {
  proveMountOnlyInsetHideInvariant,
  simulateOuterClearanceCoupledToHide,
} from "@/lib/layout/messenger-hub-list-scroll-inset-model";

const root = process.cwd();

describe("messenger bottom-nav clearance SSOT (mount-only inset)", () => {
  it("Provider occupiesClearance is mount-only (never && !hidden)", () => {
    const ctx = readFileSync(resolve(root, "lib/layout/bottom-nav-scroll-chrome-context.tsx"), "utf8");
    expect(ctx).toContain("occupiesClearance");
    expect(ctx).toContain("useBottomNavOccupiesClearance");
    expect(ctx).toContain("showBottomNavEffective");
    expect(ctx).toContain("never gated by scroll-hide");
    expect(ctx).toContain("Never drives layout clearance");
    const shell = readFileSync(resolve(root, "components/layout/ConditionalAppShell.tsx"), "utf8");
    expect(shell).toContain("bottomNavOccupiesClearance = showBottomNavEffective");
    expect(shell).not.toMatch(/showBottomNavEffective\s*&&\s*!bottomNavScrollHidden/);
    expect(shell).toContain("occupiesClearance={bottomNavOccupiesClearance}");
  });

  it("CommunityMessengerHome has no outer pb clearance", () => {
    const home = readFileSync(
      resolve(root, "components/community-messenger/CommunityMessengerHome.tsx"),
      "utf8"
    );
    expect(home).not.toContain("useBottomNavOccupiesClearance");
    expect(home).not.toContain("MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS");
    expect(home).not.toContain("MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS");
    expect(home).not.toContain("hubBottomClearanceClass");
    expect(home).not.toContain("data-cm-bottom-nav-occupies-clearance");
  });

  it("hub list scrollport owns inset for chats/calls sections", () => {
    const sections = readFileSync(
      resolve(root, "components/community-messenger/MessengerHomeMainSections.tsx"),
      "utf8"
    );
    expect(sections).toContain("useBottomNavOccupiesClearance");
    expect(sections).toContain("MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS");
    expect(sections).toContain("data-messenger-hub-list-scroll");
    expect(sections).toContain("data-cm-list-scroll-bottom-inset");
    expect(sections).toMatch(
      /data-messenger-hub-list-scroll=""[\s\S]*listScrollInsetClass|listScrollInsetClass[\s\S]*data-messenger-hub-list-scroll/
    );
  });

  it("trade/delivery pillars are hub clearance paths (shell pb-0)", () => {
    expect(isMainBottomNavHubBodyClearancePath("/community-messenger/trade-chats")).toBe(true);
    expect(isMainBottomNavHubBodyClearancePath("/community-messenger/delivery-chats")).toBe(true);
    for (const path of [
      "/community-messenger",
      "/community-messenger/trade-chats",
      "/community-messenger/delivery-chats",
    ]) {
      const f = resolveConditionalAppShellFlags(path, false);
      expect(f.showBottomNav).toBe(true);
      expect(f.mainBottomClass).toBe("pb-0");
    }
  });

  it("flags lock: showBottomNav not messenger list inset authority", () => {
    const flags = readFileSync(resolve(root, "lib/layout/conditional-app-shell-flags.ts"), "utf8");
    expect(flags).toContain("DO NOT use `showBottomNav` (viewport-blind) as messenger list inset");
    expect(flags).toContain("BottomNavScrollChromeProvider");
  });

  it("domain list canaries apply inset on scrollport only (no outer pb)", () => {
    for (const rel of [
      "components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate.tsx",
      "components/community-messenger/domain-shell-canary/DomainStoreOrderCustomerListCanaryGate.tsx",
    ]) {
      const src = readFileSync(resolve(root, rel), "utf8");
      expect(src).toContain("useBottomNavOccupiesClearance");
      expect(src).toContain("MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS");
      expect(src).toContain("listScrollInsetClass");
      expect(src).toContain("data-cm-list-scroll-bottom-inset");
      expect(src).not.toMatch(/className=\{`flex h-full min-h-0 flex-col bg-sam-app \$\{/);
      expect(src).not.toContain("clearanceClass");
    }
  });

  it("mobile room BottomNav stays off; split room keeps list-pane eligibility", () => {
    expect(isBottomNavEligibleRoute("/community-messenger/rooms/r1")).toBe(false);
    expect(shouldRenderMainBottomNav({ pathname: "/community-messenger/rooms/r1" })).toBe(false);
    expect(
      isBottomNavEligibleRoute("/community-messenger/rooms/r1", { messengerSplitViewport: true })
    ).toBe(true);
    const room = resolveConditionalAppShellFlags("/community-messenger/rooms/r1", false);
    expect(room.isChatRoomDetail).toBe(true);
    expect(room.mainBottomClass).toBe("pb-0");
  });

  it("numeric proof: mount-only inset → hide keeps clientHeight/outer Δ=0, no feedback loop", () => {
    const clearancePx = 60;
    const viewportH = 640;
    const contentH = 610; // borderline — thrash class under outer-coupled model
    const bad = simulateOuterClearanceCoupledToHide({
      viewportH,
      contentH,
      clearancePx,
    });
    expect(bad.feedbackLoop).toBe(true);
    expect(bad.steps[0]!.clientH).toBe(viewportH - clearancePx);
    expect(bad.steps[1]!.clientH).toBe(viewportH);

    const listClient = viewportH; // flex fills shell; padding is inside scrollport
    const before = {
      outerShellClientHeight: viewportH,
      listScrollClientHeight: listClient,
      listScrollScrollHeight: contentH + clearancePx,
      listPaddingBottomPx: clearancePx,
      contentHeightPx: contentH,
      hidden: false,
    };
    const after = {
      ...before,
      hidden: true,
    };
    const proof = proveMountOnlyInsetHideInvariant(before, after);
    expect(proof.outerShellDelta).toBe(0);
    expect(proof.listClientHeightDelta).toBe(0);
    expect(proof.scrollHeightDelta).toBe(0);
    expect(proof.feedbackLoop).toBe(false);
    expect(proof.ok).toBe(true);
    // hide sticks: still overflowing after hide
    expect(contentH + clearancePx > listClient).toBe(true);
  });
});
