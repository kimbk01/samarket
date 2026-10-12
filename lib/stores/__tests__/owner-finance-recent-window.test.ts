import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aggregateOpenSaleFeeObligations,
  computeCoinLedgerRecentWindowSums,
} from "@/lib/stores/owner-finance-recent-window";

describe("computeCoinLedgerRecentWindowSums (F-15)", () => {
  it("computes earned / converted / net withdrawn / reversed over the given rows only", () => {
    const rows = [
      { entryKind: "SALE_EARN", amount: 1000 },
      { entryKind: "GIFT_REDEMPTION_EARN", amount: 250 },
      { entryKind: "CONVERT_TO_BUSINESS_CASH", amount: -300 },
      { entryKind: "WITHDRAWAL_REQUEST", amount: -400 },
      { entryKind: "WITHDRAWAL_REQUEST", amount: -100 },
      // rejected request → released back; must net out
      { entryKind: "WITHDRAWAL_RELEASE", amount: 100 },
      { entryKind: "WITHDRAWAL_COMPLETE", amount: 0 },
      { entryKind: "REVERSAL", amount: -50 },
      { entryKind: "ADMIN_ADJUST", amount: 999 },
    ];
    expect(computeCoinLedgerRecentWindowSums(rows)).toEqual({
      rowCount: 9,
      earned: 1250,
      converted: 300,
      withdrawn: 400,
      reversed: 50,
    });
  });

  it("a fully rejected withdrawal contributes 0", () => {
    const r = computeCoinLedgerRecentWindowSums([
      { entryKind: "WITHDRAWAL_REQUEST", amount: -500 },
      { entryKind: "WITHDRAWAL_RELEASE", amount: 500 },
    ]);
    expect(r.withdrawn).toBe(0);
    expect(Object.is(r.withdrawn, -0)).toBe(false);
  });

  it("empty → zeros with N=0", () => {
    expect(computeCoinLedgerRecentWindowSums([])).toEqual({
      rowCount: 0,
      earned: 0,
      converted: 0,
      withdrawn: 0,
      reversed: 0,
    });
  });
});

function makeObligationSb(rows: Array<{ id: string; fee_outstanding_minor: number }>) {
  const calls: Array<{ head: boolean; range?: [number, number] }> = [];
  return {
    calls,
    from(table: string) {
      expect(table).toBe("store_sale_fee_obligations");
      const state: { head: boolean; range?: [number, number]; filters: Record<string, unknown> } = {
        head: false,
        filters: {},
      };
      const q = {
        select(_cols: string, opts?: { head?: boolean }) {
          state.head = opts?.head === true;
          return this;
        },
        eq(col: string, val: unknown) {
          state.filters[col] = val;
          return this;
        },
        order() {
          return this;
        },
        range(a: number, b: number) {
          state.range = [a, b];
          return this;
        },
        then(resolveFn: (v: unknown) => void) {
          expect(state.filters).toEqual({ store_id: "s1", status: "open" });
          calls.push({ head: state.head, range: state.range });
          if (state.head) return resolveFn({ count: rows.length, error: null });
          const [a, b] = state.range ?? [0, rows.length - 1];
          return resolveFn({ data: rows.slice(a, b + 1), error: null });
        },
      };
      return q;
    },
  };
}

describe("aggregateOpenSaleFeeObligations (M-19)", () => {
  it("sums ALL open rows (beyond the 20-row list) across pages and counts them", async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => ({ id: `o${i}`, fee_outstanding_minor: 100 }));
    const sb = makeObligationSb(rows);
    const res = await aggregateOpenSaleFeeObligations(sb as never, "s1");
    expect(res).toEqual({ ok: true, outstandingMinor: 234500, openCount: 2345 });
    expect(sb.calls.filter((c) => !c.head).length).toBe(3);
  });
});

describe("owner finance route wiring", () => {
  const src = readFileSync(resolve(process.cwd(), "app/api/me/stores/[storeId]/finance/route.ts"), "utf8");
  it("keeps the 20-row open list but uses the unlimited aggregate for totals", () => {
    expect(src).toContain(".limit(20)");
    expect(src).toContain("aggregateOpenSaleFeeObligations(sb, sid)");
    expect(src).toMatch(/openCount,/);
  });
  it("returns server sums over the same returned coin ledger rows", () => {
    expect(src).toContain("computeCoinLedgerRecentWindowSums(spLedger)");
    expect(src).toContain("storePointsRecentWindow");
  });
  it("owner view no longer computes period sums client-side", () => {
    const view = readFileSync(
      resolve(process.cwd(), "components/business/owner/OwnerStoreFinanceView.tsx"),
      "utf8"
    );
    expect(view).not.toContain("periodCoinIn");
    expect(view).not.toContain("기간 적립");
    expect(view).toContain("storePointsRecentWindow");
    expect(view).toContain("최근 ${recentN}건 기준");
  });
});
