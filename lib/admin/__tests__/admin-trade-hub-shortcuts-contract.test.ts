import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const hub = readFileSync(
  // 거래 Admin 설계 v2 §E: 허브 = TradeDashboardPage (AdminTradeHub 삭제) — 카드 클릭으로 canonical 화면 이동
  path.join(ROOT, "components/admin/trade/dashboard/TradeDashboardPage.tsx"),
  "utf8"
);

describe("Cut C Trade Hub 1-click shortcuts", () => {
  it("exposes Marketplace ops shortcuts without payment/settlement", () => {
    const required = [
      "/admin/posts-management",
      "/admin/trade/reports",
      "/admin/trade/restrictions",
      "/admin/trade/promotions",
      "/admin/trade/points",
      "/admin/trade/support",
      "/admin/trade/regions",
      "/admin/trade/audit",
    ];
    for (const href of required) {
      expect(hub, href).toContain(href);
    }
    expect(hub).not.toMatch(/settlement|store_payments|store-settlements/i);
  });
});
