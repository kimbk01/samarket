import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveStoreFinancialPeriod } from "@/lib/admin/store-financial-statement/load-store-financial-statement";
import { businessCcFinancialStatementHref } from "@/lib/admin-business/business-control-center-links";

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("ARO-OPS-UX-002-B3 store financial statement", () => {
  it("재감사 P-8 — 연결 0 이던 재무제표 화면·API·로더는 삭제, 같은 내용은 매장 재무 상세가 보여 준다", () => {
    expect(existsSync(resolve(process.cwd(), "components/admin/finance/AdminStoreFinancialStatement.tsx"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "app/api/admin/store-financial-statement/route.ts"))).toBe(false);
    const detail = read("components/finance/AdminFinanceStoreViews.tsx");
    expect(detail).toContain("/api/admin/finance/store-statement");
    expect(detail).toContain("/api/admin/finance/daily-statement");
  });

  it("wires into existing finance route (no parallel store-finance-v2)", () => {
    expect(existsSync(resolve(process.cwd(), "app/admin/store-finance-v2"))).toBe(false);
    expect(businessCcFinancialStatementHref("s1")).toBe("/admin/finance?storeId=s1");
  });

  it("entry points: business hub, settlements, delivery dashboard, cash charges", () => {
    const hub = read("components/admin/business/AdminBusinessOpsOverview.tsx");
    expect(hub).toContain("businessCcFinancialStatementHref");
    expect(hub).toContain("data-store-hub-financial-statement");

    const settlements = read("components/admin/stores/AdminStoreCommissionLedgerPage.tsx");
    expect(settlements).toContain("businessCcFinancialStatementHref");

    const delivery = read("lib/admin/domain-dashboard/load-delivery-domain-dashboard.ts");
    expect(delivery).toContain("store_financial_statement");

    const cash = read("components/admin/stores/AdminDeliveryAdCashChargeQueuePage.tsx");
    // DEF: duplicate finance links collapsed into one 「매장 재무」 link.
    expect(cash).toContain("/admin/finance?storeId=");
    expect(cash).not.toContain("view=statement");
  });

  it("period resolver keeps today/7d/30d semantics", () => {
    const today = resolveStoreFinancialPeriod({ period: "today" });
    expect(today.key).toBe("today");
    expect(today.fromDay).toBe(today.toDay);

    const d7 = resolveStoreFinancialPeriod({ period: "7d" });
    expect(d7.key).toBe("7d");
    expect(d7.fromDay <= d7.toDay).toBe(true);

    const d30 = resolveStoreFinancialPeriod({ period: "30d" });
    expect(d30.key).toBe("30d");
  });
});
