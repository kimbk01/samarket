import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { categoryKinds, classifyCashPeriodRows } from "@/lib/finance/wallet-period-history";

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
    expect(src).toContain("fetchAllPeriodRows");
    const route = readFileSync(resolve(process.cwd(), "app/api/me/stores/[storeId]/finance/history/route.ts"), "utf8");
    expect(route).toContain("getStoreIfOwner(sb, userId, sid)");
    expect(route).toContain('"this_month"');
  });
});
