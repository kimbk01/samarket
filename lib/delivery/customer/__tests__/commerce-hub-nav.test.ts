import { describe, expect, it } from "vitest";
import {
  canonicalHubHref,
  normalizeCommerceHubTab,
  normalizeGiftSubTab,
  translateLegacyGiftWalletSearchParams,
  translateLegacyOrdersSearchParams,
} from "@/lib/delivery/customer/commerce-hub-nav";

describe("commerce-hub-nav", () => {
  it("normalizes hub tab", () => {
    expect(normalizeCommerceHubTab("gifts")).toBe("gifts");
    expect(normalizeCommerceHubTab("invalid")).toBe("orders");
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
});
