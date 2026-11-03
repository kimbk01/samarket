import { describe, expect, it } from "vitest";
import {
  ownerOrderRowInDateRange,
  parseOwnerOrdersDateFilterParams,
} from "@/lib/delivery/owner/owner-orders-date-filter";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { storeSalesMonthDayRange } from "@/lib/stores/sales/store-sales-period";

const NOW = new Date("2026-11-03T11:00:00Z");

describe("주문 목록 날짜 필터 (Owner 2026-11-03)", () => {
  it("조건 없음 = 기본 목록(null)", () => {
    expect(parseOwnerOrdersDateFilterParams(new URLSearchParams(""), NOW)).toBeNull();
  });
  it("PHT 하루 범위 · 기준 열", () => {
    const r = parseOwnerOrdersDateFilterParams(new URLSearchParams("from=2026-11-03&to=2026-11-03&basis=completed"), NOW);
    expect(r).toEqual({
      ok: true,
      fromDay: "2026-11-03",
      toDay: "2026-11-03",
      range: { fromIso: "2026-11-02T16:00:00.000Z", toIso: "2026-11-03T16:00:00.000Z", basis: "completed" },
    });
    const c = parseOwnerOrdersDateFilterParams(new URLSearchParams("from=2026-11-03&to=2026-11-03"), NOW);
    expect(c && c.ok && c.range.basis).toBe("created");
  });
  it("한쪽만·92일 초과 = 오류", () => {
    expect(parseOwnerOrdersDateFilterParams(new URLSearchParams("from=2026-11-03"), NOW)).toEqual({
      ok: false,
      error: "orders_date_range_required",
    });
    expect(parseOwnerOrdersDateFilterParams(new URLSearchParams("from=2026-01-01&to=2026-11-03"), NOW)).toEqual({
      ok: false,
      error: "orders_date_range_too_long",
    });
  });
  it("실시간 병합 범위 판정 — 완료 기준은 완료 시각", () => {
    const range = { fromIso: "2026-11-02T16:00:00.000Z", toIso: "2026-11-03T16:00:00.000Z", basis: "completed" as const };
    expect(ownerOrderRowInDateRange({ created_at: "2026-11-01T00:00:00Z", completed_at: "2026-11-02T17:00:00Z" }, range)).toBe(true);
    expect(ownerOrderRowInDateRange({ created_at: "2026-11-02T17:00:00Z", completed_at: null }, range)).toBe(false);
    expect(
      ownerOrderRowInDateRange({ created_at: "2026-11-02T17:00:00Z" }, { ...range, basis: "created" })
    ).toBe(true);
  });
  it("주소에 날짜 유지 · 매출 월 줄 → 그 달 일별", () => {
    expect(buildStoreOrdersHref({ storeId: "s1", tab: "done", dateFrom: "2026-11-03", dateTo: "2026-11-03" })).toBe(
      "/stores/owner/orders?storeId=s1&tab=done&from=2026-11-03&to=2026-11-03"
    );
    expect(buildStoreOrdersHref({ storeId: "s1", dateFrom: "2026-11-03" })).toBe("/stores/owner/orders?storeId=s1");
    expect(storeSalesMonthDayRange("2026-10", NOW)).toEqual({ fromDay: "2026-10-01", toDay: "2026-10-31" });
    expect(storeSalesMonthDayRange("2026-11", NOW)).toEqual({ fromDay: "2026-11-01", toDay: "2026-11-03" });
  });
});
