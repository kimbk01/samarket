import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  categoryKinds,
  chainLatestBalance,
  classifyCashPeriodRows,
  loadCashPeriodSummary,
  loadCoinPeriodSummary,
} from "@/lib/finance/wallet-period-history";

describe("매장 Coin·Cash 기간 내역 (Owner 2026-11-03)", () => {
  it("Cash 기간 합계 — 종류별 분류, 모르는 종류도 숨기지 않음, 입금−출금 = 잔액 변화", () => {
    const rows = [
      { entryKind: "TOP_UP", direction: "credit", amountMinor: 1050 },
      { entryKind: "CONVERT_FROM_STORE_POINTS", direction: "credit", amountMinor: 100 },
      { entryKind: "SALE_FEE", direction: "debit", amountMinor: 300 },
      { entryKind: "SALE_FEE_SETTLEMENT", direction: "debit", amountMinor: 50 },
      { entryKind: "AD_SPEND", direction: "debit", amountMinor: 200 },
      { entryKind: "AD_REFUND", direction: "credit", amountMinor: 20 },
      { entryKind: "ADMIN_ADJUST", direction: "debit", amountMinor: 1150 },
      { entryKind: "SOMETHING_NEW", direction: "credit", amountMinor: 7 },
    ];
    const s = classifyCashPeriodRows(rows);
    expect(s.topupMinor).toBe(1050);
    expect(s.fromConversionMinor).toBe(100);
    expect(s.saleFeeMinor).toBe(300);
    expect(s.outstandingCollectionMinor).toBe(50);
    expect(s.adSpendMinor).toBe(200);
    expect(s.refundMinor).toBe(20);
    expect(s.adjustmentDebitMinor).toBe(1150);
    expect(s.otherCreditMinor).toBe(7);
    expect(s.creditMinor - s.debitMinor).toBe(1050 + 100 + 20 + 7 - 300 - 50 - 200 - 1150);
  });

  it("합계 칸을 누르면 그 종류만 — Coin 출금은 신청·반려 환원·지급을 함께", () => {
    expect(categoryKinds("coin", "converted")).toEqual(["CONVERT_TO_BUSINESS_CASH"]);
    expect(categoryKinds("coin", "withdrawn")).toContain("WITHDRAWAL_RELEASE");
    expect(categoryKinds("cash", "ads")).toEqual(["AD_SPEND", "AD_REFUND", "PARTNER_SPEND", "PARTNER_REFUND"]);
    expect(categoryKinds("cash", "")).toBeNull();
    expect(categoryKinds("cash", "nope")).toBeNull();
  });

  it("합계는 기간 전체 행으로 (페이지 행이 아님) · 사장님 확인", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/finance/wallet-period-history.ts"), "utf8");
    // P-1 — 기간 전체 합계 = DB 집계 1회 (전량 읽기 없음)
    expect(src).toContain("OWNER_WALLET_PERIOD_SUMMARY_RPC");
    expect(src).not.toContain("fetchAllPeriodRows");
    const route = readFileSync(resolve(process.cwd(), "app/api/me/stores/[storeId]/finance/history/route.ts"), "utf8");
    expect(route).toContain("getStoreIfOwner(sb, userId, sid)");
    // 기본 이번 달 · 「전체」도 이번 달 (사장님 누적 금지, Owner 2026-11-03 §6-2)
    expect(route).toContain("parseOwnerMoneyPeriodParams(sp)");
    const q = readFileSync(resolve(process.cwd(), "lib/stores/commission/store-commission-ledger-query.ts"), "utf8");
    expect(q).toContain('OWNER_MONEY_DEFAULT_PERIOD: StoreCommissionPeriod = "this_month"');
  });
});

describe("P-1 — DB 집계로 만든 합계 = 줄마다 더한 합계 (운영 대조값 2026-11-04: 나의 오른손딸방 Cash 9/5~9/10 PHT)", () => {
  const rpcResult = {
    row_count: 12,
    sums_by_kind: [
      { entry_kind: "AD_REFUND", direction: "credit", count: 1, signed: 12000, abs: 12000 },
      { entry_kind: "AD_SPEND", direction: "debit", count: 2, signed: -1000000, abs: 1000000 },
      { entry_kind: "PARTNER_SPEND", direction: "debit", count: 1, signed: -12000, abs: 12000 },
      { entry_kind: "SALE_FEE", direction: "debit", count: 1, signed: -1000, abs: 1000 },
      { entry_kind: "SALE_FEE_SETTLEMENT", direction: "debit", count: 2, signed: -13600, abs: 13600 },
      { entry_kind: "TOP_UP", direction: "credit", count: 5, signed: 542200, abs: 542200 },
    ],
    close_group: [{ id: "c", created_at: "2026-09-10T01:00:00Z", signed: 1000, balance_after: 9400 }],
    close_prev_group: [],
    open_group: [{ id: "o", created_at: "2026-09-04T10:00:00Z", signed: -12000, balance_after: 481800 }],
    open_prev_group: [],
  };
  it("Cash: 시작 481,800 · 종료 9,400 · 칸 합 · 대조 맞음 · RPC 1회", async () => {
    const rpc = vi.fn(async () => ({ data: rpcResult, error: null }));
    const s = await loadCashPeriodSummary({ rpc } as never, "store-1", {
      fromIso: "2026-09-04T16:00:00.000Z",
      toIso: "2026-09-10T16:00:00.000Z",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(s).toMatchObject({
      openingMinor: 481800,
      closingMinor: 9400,
      topupMinor: 542200,
      adSpendMinor: 1000000,
      partnerSpendMinor: 12000,
      refundMinor: 12000,
      saleFeeMinor: 1000,
      outstandingCollectionMinor: 13600,
      rowCount: 12,
      reconciled: true,
      truncated: false,
    });
  });
  it("같은 시각 경계 묶음은 잔액 사슬의 마지막 줄 · 기간 시작이 없으면 시작 잔액 0 · 조회 실패 = null", async () => {
    expect(
      chainLatestBalance(
        [
          { created_at: "t", signed: 5, balance_after: 15 },
          { created_at: "t", signed: 10, balance_after: 10 },
        ],
        [{ created_at: "s", signed: 0, balance_after: 0 }]
      )
    ).toBe(15);
    const rpc = vi.fn(async () => ({ data: { ...rpcResult, open_group: [] }, error: null }));
    const s = await loadCoinPeriodSummary({ rpc } as never, "store-1", { fromIso: null, toIso: null });
    expect(s?.opening).toBe(0);
    const failed = await loadCoinPeriodSummary({ rpc: async () => ({ data: null, error: { message: "x" } }) } as never, "s", {
      fromIso: null,
      toIso: null,
    });
    expect(failed).toBeNull();
  });
});
