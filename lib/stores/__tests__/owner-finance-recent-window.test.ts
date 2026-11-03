import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadOpenSaleFeeTotalsFromCashPosition } from "@/lib/stores/owner-finance-recent-window";

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
  it("Coin·Cash 내역은 기간 내역 API로 — 「최근 N건 기준」 합계 폐지 (Owner 2026-11-03)", () => {
    expect(src).not.toContain("storePointsRecentWindow");
    const view = readFileSync(
      resolve(process.cwd(), "components/business/owner/OwnerStoreFinanceView.tsx"),
      "utf8"
    );
    expect(view).not.toContain("storePointsRecentWindow");
    expect(view).toContain("<OwnerWalletHistory");
    const catalog = readFileSync(resolve(process.cwd(), "lib/i18n/catalog/owner-ui-copy-keys.ts"), "utf8");
    expect(catalog).not.toContain("owner_copy_finance_recent_earned");
    const history = readFileSync(resolve(process.cwd(), "app/api/me/stores/[storeId]/finance/history/route.ts"), "utf8");
    expect(history).toContain("loadCoinPeriodSummary");
    expect(history).toContain("getStoreIfOwner");
  });
});
