import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isMainBottomNavHubBodyClearancePath } from "@/lib/layout/main-bottom-nav-hub-clearance";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { isBottomNavEligibleRoute, shouldRenderMainBottomNav } from "@/lib/navigation/bottom-nav-route-policy";

const root = process.cwd();

describe("messenger bottom-nav clearance SSOT (Fix B)", () => {
  it("Provider exposes occupiesClearance with mount && !hidden", () => {
    const ctx = readFileSync(resolve(root, "lib/layout/bottom-nav-scroll-chrome-context.tsx"), "utf8");
    expect(ctx).toContain("occupiesClearance");
    expect(ctx).toContain("useBottomNavOccupiesClearance");
    expect(ctx).toContain("showBottomNavEffective && !hidden");
    const shell = readFileSync(resolve(root, "components/layout/ConditionalAppShell.tsx"), "utf8");
    expect(shell).toContain("bottomNavOccupiesClearance");
    expect(shell).toContain("showBottomNavEffective && !bottomNavScrollHidden");
    expect(shell).toContain("occupiesClearance={bottomNavOccupiesClearance}");
  });

  it("CommunityMessengerHome clearance is Provider-gated only", () => {
    const home = readFileSync(
      resolve(root, "components/community-messenger/CommunityMessengerHome.tsx"),
      "utf8"
    );
    expect(home).toContain("useBottomNavOccupiesClearance");
    expect(home).toContain("hubBottomClearanceClass");
    expect(home).toContain("data-cm-bottom-nav-occupies-clearance");
    expect(home).not.toMatch(
      /className=\{\s*tabletSplitListOnly[\s\S]*MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS\}/
    );
  });

  it("trade/delivery pillars are hub clearance paths (shell pb-0, no double shell padding)", () => {
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

  it("domain list canaries gate clearance on Provider", () => {
    for (const rel of [
      "components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate.tsx",
      "components/community-messenger/domain-shell-canary/DomainStoreOrderCustomerListCanaryGate.tsx",
    ]) {
      const src = readFileSync(resolve(root, rel), "utf8");
      expect(src).toContain("useBottomNavOccupiesClearance");
      expect(src).toContain("clearanceClass");
      expect(src).not.toMatch(/className=\{`[^`]*\$\{MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS\}/);
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
});
