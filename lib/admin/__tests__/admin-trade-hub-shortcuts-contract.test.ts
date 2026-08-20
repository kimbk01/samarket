import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const hub = readFileSync(
  path.join(ROOT, "components/admin/trade/AdminTradeHub.tsx"),
  "utf8"
);

describe("Cut C Trade Hub 1-click shortcuts", () => {
  it("exposes Marketplace ops shortcuts without payment/settlement", () => {
    const required = [
      "/admin/posts-management",
      "/admin/trade-flow",
      "/admin/chats/trade",
      "/admin/reports?domain=trade",
      "/admin/reviews",
      "/admin/ad-applications",
      "/admin/trade-post-ads",
      "/admin/favorites",
      "/admin/users?from=trade",
      "/admin/audit-logs?target_type=post",
      "/admin/menus/trade",
      "/admin/trade/settings",
    ];
    for (const href of required) {
      expect(hub, href).toContain(href);
    }
    expect(hub).not.toMatch(/settlement|store_payments|store-settlements/i);
  });
});
