import { describe, expect, it } from "vitest";
import {
  canonicalHubHref,
  hubOverviewHref,
  normalizeCommerceHubTab,
  normalizeGiftSubTab,
  parseCommerceHubState,
  parseCommerceHubTabParam,
  translateLegacyGiftWalletSearchParams,
  translateLegacyOrdersSearchParams,
} from "@/lib/delivery/customer/commerce-hub-nav";

describe("commerce-hub-nav", () => {
  it("normalizes hub tab", () => {
    expect(normalizeCommerceHubTab("gifts")).toBe("gifts");
    expect(normalizeCommerceHubTab("invalid")).toBe("orders");
  });

  it("bare activity URL defaults to orders (no overview)", () => {
    expect(parseCommerceHubTabParam(new URLSearchParams(""))).toBeNull();
    const state = parseCommerceHubState(new URLSearchParams(""));
    expect(state.isOverview).toBe(false);
    expect(state.tab).toBe("orders");
  });

  it("explicit tab param selects domain body", () => {
    const state = parseCommerceHubState(new URLSearchParams("tab=gifts&giftTab=received"));
    expect(state.isOverview).toBe(false);
    expect(state.tab).toBe("gifts");
    expect(state.giftTab).toBe("received");
  });

  it("maps legacy gift wallet tabs", () => {
    expect(normalizeGiftSubTab("pending")).toBe("received");
    expect(normalizeGiftSubTab("sent")).toBe("sent");
  });

  it("translates legacy orders expand", () => {
    const sp = new URLSearchParams("expand=abc&orderFilter=receiving");
    const out = translateLegacyOrdersSearchParams(sp);
    expect(out.get("tab")).toBe("orders");
    expect(out.get("expand")).toBe("abc");
    expect(out.get("orderFilter")).toBe("receiving");
  });

  it("translates legacy gift wallet pending tab", () => {
    const out = translateLegacyGiftWalletSearchParams(new URLSearchParams("tab=pending"));
    expect(out.get("tab")).toBe("gifts");
    expect(out.get("giftTab")).toBe("received");
  });

  it("builds canonical hub href", () => {
    expect(canonicalHubHref("gifts", { giftTab: "received" })).toBe(
      "/orders/activity?tab=gifts&giftTab=received"
    );
  });

  it("hubOverviewHref canonicalizes to orders tab", () => {
    expect(hubOverviewHref()).toBe("/orders/activity?tab=orders");
    expect(hubOverviewHref({ from: "delivery-activity" })).toBe(
      "/orders/activity?tab=orders&from=delivery-activity"
    );
  });
});
