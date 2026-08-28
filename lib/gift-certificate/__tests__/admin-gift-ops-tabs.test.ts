import { describe, expect, it } from "vitest";
import {
  ADMIN_GIFT_OPS_TABS,
  buildAdminGiftOpsHref,
  legacyGiftPathToOpsHref,
  parseAdminGiftOpsTab,
} from "@/lib/gift-certificate/admin-gift-ops-tabs";

describe("admin-gift-ops-tabs", () => {
  it("exposes six workflow groups", () => {
    expect(ADMIN_GIFT_OPS_TABS).toEqual([
      "dashboard",
      "products",
      "instances",
      "ledger",
      "finance",
      "audit",
    ]);
  });

  it("maps legacy tabs and builds canonical hrefs", () => {
    expect(parseAdminGiftOpsTab("summary")).toBe("dashboard");
    expect(parseAdminGiftOpsTab("redemptions")).toBe("ledger");
    expect(parseAdminGiftOpsTab("money")).toBe("finance");
    expect(parseAdminGiftOpsTab("recovery")).toBe("finance");
    expect(buildAdminGiftOpsHref({ tab: "finance", finance: "external" })).toContain("tab=finance");
    expect(buildAdminGiftOpsHref({ tab: "finance", finance: "external" })).toContain("finance=external");
    const href = legacyGiftPathToOpsHref("cash-outs", new URLSearchParams("id=abc"));
    expect(href).toContain("tab=finance");
    expect(href).toContain("finance=external");
    expect(href).toContain("id=abc");
  });
});
