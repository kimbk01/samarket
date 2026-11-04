import { describe, expect, it } from "vitest";
import { resolveFinanceListWindow } from "@/lib/finance/resolve-finance-list-window";
import { storeCommissionPeriodInputError } from "@/lib/stores/commission/store-commission-ledger-query";
import { resolveStoreFinancialPeriod } from "@/lib/admin/store-financial-statement/load-store-financial-statement";

describe("finance list window / today boundary", () => {
  it("date=today uses Manila business day SSOT (not client Date invent)", () => {
    const win = resolveFinanceListWindow({ date: "today" });
    const period = resolveStoreFinancialPeriod({ period: "today" });
    expect(win.day).toBe(period.fromDay);
    expect(win.fromIso).toBe(period.fromIso);
    expect(win.toIso).toBe(period.toIso);
  });

  it("하루 = 시작일·종료일을 같게 · 경계는 PHT (D-16 · 이전: 시작일만 = 그날 하루, 정산·신청 화면은 그날 이후로 해석이 달랐다)", () => {
    const win = resolveFinanceListWindow({ from: "2026-01-15", to: "2026-01-15" });
    expect(win.fromIso).toBe("2026-01-14T16:00:00.000Z");
    // PHT 1월 15일 하루 = UTC 1/14 16:00 ~ 1/15 15:59:59.999 (DB 함수가 끝 포함)
    expect(win.toIso).toBe("2026-01-15T15:59:59.999Z");
  });

  it("시작일만·종료일만·뒤바뀜·형식 오류는 API 앞단에서 400 invalid_period — 창 계산까지 오지 않는다", () => {
    const sp = (q: string) => new URLSearchParams(q);
    expect(storeCommissionPeriodInputError(sp("from=2026-01-15"))).toBe("invalid_period");
    expect(storeCommissionPeriodInputError(sp("to=2026-01-15"))).toBe("invalid_period");
    expect(storeCommissionPeriodInputError(sp("from=2026-01-16&to=2026-01-15"))).toBe("invalid_period");
    expect(storeCommissionPeriodInputError(sp("from=2026-02-30&to=2026-03-01"))).toBe("invalid_period");
    expect(storeCommissionPeriodInputError(sp("period=custom"))).toBe("invalid_period");
    expect(storeCommissionPeriodInputError(sp("from=2026-01-15&to=2026-01-15"))).toBeNull();
    expect(storeCommissionPeriodInputError(sp("period=this_month&from=2026-01-16"))).toBeNull();
    expect(storeCommissionPeriodInputError(sp("date=today"))).toBeNull();
    expect(storeCommissionPeriodInputError(sp(""))).toBeNull();
    // 창 계산은 날짜가 하나뿐이면 기간 없음(앞단이 이미 막는다)
    expect(resolveFinanceListWindow({ from: "2026-01-15" })).toEqual({ fromIso: null, toIso: null, day: null });
  });
});
