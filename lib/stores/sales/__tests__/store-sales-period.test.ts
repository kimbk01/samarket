import { describe, expect, it } from "vitest";
import {
  parseOwnerMoneyPeriodParams,
  parseOwnerStoreCommissionLedgerQuery,
  resolveStoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";
import {
  formatStoreSalesBucketLabel,
  parseStoreSalesSummary,
  resolveStoreSalesDayRange,
  resolveStoreSalesMonthRange,
} from "@/lib/stores/sales/store-sales-period";

/** 2026-11-03 19:00 PHT = 11:00Z */
const NOW = new Date("2026-11-03T11:00:00Z");

describe("사장님 매출 기간 (PHT · 누적 없음, Owner 2026-11-03 §6)", () => {
  it("어제 = 11-02 00:00 ~ 11-03 00:00 PHT", () => {
    expect(resolveStoreCommissionPeriod("yesterday", null, null, NOW)).toEqual({
      fromIso: "2026-11-01T16:00:00.000Z",
      toIso: "2026-11-02T16:00:00.000Z",
    });
  });
  it("지난달 = 10-01 00:00 ~ 11-01 00:00 PHT, 1월이면 전년 12월", () => {
    expect(resolveStoreCommissionPeriod("last_month", null, null, NOW)).toEqual({
      fromIso: "2026-09-30T16:00:00.000Z",
      toIso: "2026-10-31T16:00:00.000Z",
    });
    const jan = resolveStoreCommissionPeriod("last_month", null, null, new Date("2027-01-15T04:00:00Z"));
    expect(jan.fromIso).toBe("2026-11-30T16:00:00.000Z");
    expect(jan.toIso).toBe("2026-12-31T16:00:00.000Z");
  });
  it("사장님 경로: 기간 없음·전체 → 이번 달, 주문번호 단건 조회만 예외", () => {
    expect(parseOwnerMoneyPeriodParams(new URLSearchParams("")).period).toBe("this_month");
    expect(parseOwnerMoneyPeriodParams(new URLSearchParams("period=all")).period).toBe("this_month");
    expect(parseOwnerMoneyPeriodParams(new URLSearchParams("period=yesterday")).period).toBe("yesterday");
    expect(parseOwnerStoreCommissionLedgerQuery(new URLSearchParams(""), NOW).period).toBe("this_month");
    expect(parseOwnerStoreCommissionLedgerQuery(new URLSearchParams("order_no=SO1"), NOW).period).toBe("all");
  });
  it("일별 최대 92일 · 직접 지정은 시작·끝 필수", () => {
    expect(resolveStoreSalesDayRange("custom", "2026-01-01", "2026-11-03", NOW)).toEqual({
      ok: false,
      error: "sales_period_too_long",
    });
    expect(resolveStoreSalesDayRange("custom", "2026-10-01", null, NOW)).toEqual({
      ok: false,
      error: "sales_period_required",
    });
    const ok = resolveStoreSalesDayRange("all", null, null, NOW);
    expect(ok).toMatchObject({ ok: true, period: "this_month", fromIso: "2026-10-31T16:00:00.000Z" });
  });
  it("월별 = 최근 12개월(이번 달 포함) 1일 00:00 PHT ~ 내일 00:00 PHT", () => {
    expect(resolveStoreSalesMonthRange(NOW)).toEqual({
      fromIso: "2025-11-30T16:00:00.000Z",
      toIso: "2026-11-03T16:00:00.000Z",
    });
  });
  it("DB 응답 파싱·줄 이름", () => {
    const p = parseStoreSalesSummary({
      totals: { completed_count: 2, net_sales_php: 100, avg_order_value_php: 65 },
      rows: [{ bucket: "2026-11-03", completed_count: 1, net_sales_php: 70 }],
    });
    expect(p.totals.completedCount).toBe(2);
    expect(p.rows[0]).toMatchObject({ bucket: "2026-11-03", netSalesPhp: 70 });
    expect(formatStoreSalesBucketLabel("2026-11-03", "day", "ko")).toBe("11-03 (화)");
    expect(formatStoreSalesBucketLabel("2026-11", "month", "ko")).toBe("2026-11");
  });
});
