import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeCoinLedgerRecentWindowSums,
  loadOpenSaleFeeTotalsFromCashPosition,
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

function makeRpcSb(result: { data: unknown; error: { message: string } | null }) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  return {
    calls,
    from() {
      throw new Error("FIN-11: owner totals must not read store_sale_fee_obligations from TS");
    },
    rpc(fn: string, args: unknown) {
      calls.push({ fn, args });
      return Promise.resolve(result);
    },
  };
}

describe("loadOpenSaleFeeTotalsFromCashPosition (M-19 / FIN-11)", () => {
  it("maps store_cash_position (one SQL function) — no TS aggregation", async () => {
    const sb = makeRpcSb({ data: { outstanding_minor: 234500, open_count: 2345, balance_minor: 0 }, error: null });
    const res = await loadOpenSaleFeeTotalsFromCashPosition(sb as never, " s1 ");
    expect(res).toEqual({ ok: true, outstandingMinor: 234500, openCount: 2345 });
    expect(sb.calls).toEqual([{ fn: "store_cash_position", args: { p_store_id: "s1" } }]);
  });
  it("openCount null when the DB predates open_count; errors surface as ok:false", async () => {
    const old = makeRpcSb({ data: { outstanding_minor: 100 }, error: null });
    expect(await loadOpenSaleFeeTotalsFromCashPosition(old as never, "s1")).toEqual({
      ok: true,
      outstandingMinor: 100,
      openCount: null,
    });
    const bad = makeRpcSb({ data: null, error: { message: "boom" } });
    expect(await loadOpenSaleFeeTotalsFromCashPosition(bad as never, "s1")).toEqual({ ok: false, error: "boom" });
  });
});

describe("owner finance route wiring", () => {
  const src = readFileSync(resolve(process.cwd(), "app/api/me/stores/[storeId]/finance/route.ts"), "utf8");
  it("keeps the 20-row open list but takes totals from SQL store_cash_position (FIN-11)", () => {
    expect(src).toContain(".limit(20)");
    expect(src).toContain("loadOpenSaleFeeTotalsFromCashPosition(sb, sid)");
    expect(src).not.toContain("aggregateOpenSaleFeeObligations");
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
