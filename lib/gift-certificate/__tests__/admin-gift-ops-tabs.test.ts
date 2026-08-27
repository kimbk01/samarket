import { describe, expect, it } from "vitest";
import {
  ADMIN_GIFT_OPS_TABS,
  buildAdminGiftOpsHref,
  legacyGiftPathToOpsHref,
  parseAdminGiftOpsTab,
} from "@/lib/gift-certificate/admin-gift-ops-tabs";

describe("admin-gift-ops-tabs", () => {
  it("exposes eight lifecycle tabs", () => {
    expect(ADMIN_GIFT_OPS_TABS).toEqual([
      "summary",
      "products",
      "instances",
      "redemptions",
      "revenue",
      "money",
      "recovery",
      "audit",
    ]);
  });

  it("builds canonical hrefs and legacy redirects", () => {
    expect(parseAdminGiftOpsTab("instances")).toBe("instances");
    expect(buildAdminGiftOpsHref({ tab: "money", money: "external" })).toContain("tab=money");
    expect(buildAdminGiftOpsHref({ tab: "money", money: "external" })).toContain("money=external");
    const href = legacyGiftPathToOpsHref("cash-outs", new URLSearchParams("id=abc"));
    expect(href).toContain("tab=money");
    expect(href).toContain("money=external");
    expect(href).toContain("id=abc");
  });
});
