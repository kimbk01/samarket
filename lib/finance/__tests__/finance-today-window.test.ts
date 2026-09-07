import { describe, expect, it } from "vitest";
import { resolveFinanceListWindow } from "@/lib/finance/resolve-finance-list-window";
import { resolveStoreFinancialPeriod } from "@/lib/admin/store-financial-statement/load-store-financial-statement";

describe("finance list window / today boundary", () => {
  it("date=today uses Manila business day SSOT (not client Date invent)", () => {
    const win = resolveFinanceListWindow({ date: "today" });
    const period = resolveStoreFinancialPeriod({ period: "today" });
    expect(win.day).toBe(period.fromDay);
    expect(win.fromIso).toBe(period.fromIso);
    expect(win.toIso).toBe(period.toIso);
  });

  it("explicit from day resolves to that calendar day window", () => {
    const win = resolveFinanceListWindow({ from: "2026-01-15" });
    expect(win.day).toBe("2026-01-15");
    expect(win.fromIso).toBeTruthy();
    expect(win.toIso).toBeTruthy();
  });
});
