/**
 * H-10 (Owner 2026-11-03) — 관리자 신청 목록 기간 합계 순수 계산 + 기간 경계(PHT).
 */
import { describe, expect, it } from "vitest";
import {
  CASH_CHARGE_SUMMARY_BUCKETS,
  COIN_WITHDRAWAL_SUMMARY_BUCKETS,
  POINT_CHARGE_SUMMARY_BUCKETS,
  parseAdminRequestPeriod,
  summarizeAdminRequestRows,
} from "@/lib/admin/finance/admin-request-period-summary";

describe("summarizeAdminRequestRows", () => {
  it("Coin 출금: 신청 = 전체 · 지급 완료 = PAID · 반려 · 대기 = REQUESTED+APPROVED · 취소 = 기타", () => {
    const s = summarizeAdminRequestRows(
      [
        { status: "REQUESTED", amount: 10 },
        { status: "APPROVED", amount: 5 },
        { status: "PAID", amount: 100 },
        { status: "PAID", amount: 50 },
        { status: "REJECTED", amount: 7 },
        { status: "CANCELLED", amount: 3 },
      ],
      COIN_WITHDRAWAL_SUMMARY_BUCKETS,
      { fromDay: "2026-11-01", toDay: "2026-11-30" }
    );
    expect(s.requested).toEqual({ count: 6, amount: 175, amount2: 0 });
    expect(s.approved).toEqual({ count: 2, amount: 150, amount2: 0 });
    expect(s.rejected).toEqual({ count: 1, amount: 7, amount2: 0 });
    expect(s.pending).toEqual({ count: 2, amount: 15, amount2: 0 });
    expect(s.other).toEqual({ count: 1, amount: 3, amount2: 0 });
    expect(s.fromDay).toBe("2026-11-01");
    expect(s.truncated).toBe(false);
    // 칸 합 = 신청 합
    expect(s.approved.amount + s.rejected.amount + s.pending.amount + s.other.amount).toBe(s.requested.amount);
  });

  it("Cash 충전 centavo 정수 합산 · Point 충전 소문자 상태 + 보조 금액(결제 ₱)", () => {
    const cash = summarizeAdminRequestRows(
      [
        { status: "APPROVED", amount: 50_000 },
        { status: "PENDING", amount: 12_345 },
      ],
      CASH_CHARGE_SUMMARY_BUCKETS
    );
    expect(cash.approved.amount).toBe(50_000);
    expect(cash.pending.amount).toBe(12_345);

    const point = summarizeAdminRequestRows(
      [
        { status: "waiting_confirm", amount: 1000, amount2: 100 },
        { status: "on_hold", amount: 500, amount2: 50 },
        { status: "approved", amount: 2000, amount2: 200 },
      ],
      POINT_CHARGE_SUMMARY_BUCKETS
    );
    expect(point.pending).toEqual({ count: 2, amount: 1500, amount2: 150 });
    expect(point.approved).toEqual({ count: 1, amount: 2000, amount2: 200 });
    expect(point.requested.amount2).toBe(350);
  });
});

describe("parseAdminRequestPeriod", () => {
  it("from/to (PHT 날짜) → UTC [from 00:00 PHT, to 다음날 00:00 PHT)", () => {
    const p = parseAdminRequestPeriod(new URLSearchParams("from=2026-11-01&to=2026-11-03"));
    expect(p).toEqual({
      fromDay: "2026-11-01",
      toDay: "2026-11-03",
      fromIso: "2026-10-31T16:00:00.000Z",
      toIso: "2026-11-03T16:00:00.000Z",
    });
  });

  it("없으면 전체 기간", () => {
    expect(parseAdminRequestPeriod(new URLSearchParams(""))).toEqual({
      fromDay: null,
      toDay: null,
      fromIso: null,
      toIso: null,
    });
  });
});
