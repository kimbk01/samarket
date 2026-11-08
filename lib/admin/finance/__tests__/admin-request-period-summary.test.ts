/**
 * H-10 (Owner 2026-11-03) — 관리자 신청 목록 기간 합계 순수 계산 + 기간 경계(PHT).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/lib/i18n/messages";
import {
  ADMIN_REQUEST_DECIDED_TIME_COLUMNS,
  CASH_CHARGE_SUMMARY_BUCKETS,
  loadAdminRequestPeriodSummary,
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

/**
 * R3-i (재감사 2026-11-03) — 승인·지급 완료·반려 칸 = 처리 시각 기준, 신청·대기·취소 = 신청 시각 기준.
 */
type Row = Record<string, unknown>;

/** 최소 PostgREST 흉내 — select/gte/lt/eq/in/order/range 만. */
function fakeSb(rows: Row[]) {
  const calls: Array<{ gte?: string; lt?: string; inCol?: string }> = [];
  const from = () => {
    const filters: Array<(r: Row) => boolean> = [];
    const call: { gte?: string; lt?: string; inCol?: string } = {};
    calls.push(call);
    const q = {
      select: () => q,
      gte: (col: string, v: string) => {
        call.gte = col;
        filters.push((r) => r[col] != null && String(r[col]) >= v);
        return q;
      },
      lt: (col: string, v: string) => {
        call.lt = col;
        filters.push((r) => r[col] != null && String(r[col]) < v);
        return q;
      },
      eq: (col: string, v: string) => {
        filters.push((r) => r[col] === v);
        return q;
      },
      in: (col: string, v: readonly string[]) => {
        call.inCol = col;
        filters.push((r) => v.includes(String(r[col])));
        return q;
      },
      order: () => q,
      range: async (a: number, b: number) => ({
        data: rows.filter((r) => filters.every((f) => f(r))).slice(a, b + 1),
        error: null,
      }),
    };
    return q;
  };
  return { sb: { from }, calls };
}

describe("R3-i — 처리 시각 기준 칸", () => {
  const period = {
    fromDay: "2026-11-01",
    toDay: "2026-11-30",
    fromIso: "2026-10-31T16:00:00.000Z",
    toIso: "2026-11-30T16:00:00.000Z",
  };

  it("Coin 출금: 10월 신청 → 11월 지급 완료는 11월 「지급 완료」에 들어가고, 11월 신청 → 12월 지급은 빠진다", async () => {
    const { sb, calls } = fakeSb([
      // 10월 신청 · 11월 5일 지급
      { id: "a", status: "PAID", amount: 100, created_at: "2026-10-20T00:00:00.000Z", paid_at: "2026-11-05T00:00:00.000Z" },
      // 11월 신청 · 12월 지급 (11월 기간 밖에서 처리)
      { id: "b", status: "PAID", amount: 40, created_at: "2026-11-10T00:00:00.000Z", paid_at: "2026-12-02T00:00:00.000Z" },
      // 11월 신청 · 11월 반려
      { id: "c", status: "REJECTED", amount: 7, created_at: "2026-11-11T00:00:00.000Z", rejected_at: "2026-11-12T00:00:00.000Z" },
      // 11월 신청 · 대기
      { id: "d", status: "REQUESTED", amount: 9, created_at: "2026-11-15T00:00:00.000Z" },
    ]);
    // Coin 출금 경로처럼 decidedTimeColumns 를 넘기지 않아도 표 이름으로 처리 시각 열을 쓴다.
    const s = await loadAdminRequestPeriodSummary(sb, {
      table: "coin_withdrawal_requests",
      timeColumn: "created_at",
      statusColumn: "status",
      amountColumn: "amount",
      period,
      buckets: COIN_WITHDRAWAL_SUMMARY_BUCKETS,
    });
    expect(s).not.toBeNull();
    expect(s!.decidedBasis).toBe("processed");
    expect(s!.requested).toEqual({ count: 3, amount: 56, amount2: 0 }); // b, c, d (신청 시각 11월)
    expect(s!.approved).toEqual({ count: 1, amount: 100, amount2: 0 }); // a (paid_at 11월)
    expect(s!.rejected).toEqual({ count: 1, amount: 7, amount2: 0 }); // c (rejected_at 11월)
    expect(s!.pending).toEqual({ count: 1, amount: 9, amount2: 0 });
    expect(calls.some((c) => c.gte === "paid_at")).toBe(true);
    expect(calls.some((c) => c.gte === "rejected_at")).toBe(true);
  });

  it("처리 시각 열 = 마이그레이션 열 이름", () => {
    expect(ADMIN_REQUEST_DECIDED_TIME_COLUMNS.coin_withdrawal_requests).toEqual({
      approved: "paid_at",
      rejected: "rejected_at",
    });
    expect(ADMIN_REQUEST_DECIDED_TIME_COLUMNS.business_cash_charge_requests).toEqual({
      approved: "decided_at",
      rejected: "decided_at",
    });
    expect(ADMIN_REQUEST_DECIDED_TIME_COLUMNS.point_charge_requests).toEqual({
      approved: "processed_at",
      rejected: "processed_at",
    });
  });

  it("Cash 충전: decided_at 기준 승인 · 전체 기간이면 한 번만 읽는다", async () => {
    const { sb } = fakeSb([
      { id: "a", status: "APPROVED", amount_minor: 5000, created_at: "2026-10-30T00:00:00.000Z", decided_at: "2026-11-01T01:00:00.000Z" },
      { id: "b", status: "PENDING", amount_minor: 100, created_at: "2026-11-02T00:00:00.000Z" },
    ]);
    const s = await loadAdminRequestPeriodSummary(sb, {
      table: "business_cash_charge_requests",
      timeColumn: "created_at",
      statusColumn: "status",
      amountColumn: "amount_minor",
      period,
      buckets: CASH_CHARGE_SUMMARY_BUCKETS,
    });
    expect(s!.approved.amount).toBe(5000);
    expect(s!.requested.amount).toBe(100);

    const all = fakeSb([{ id: "a", status: "APPROVED", amount_minor: 5000, created_at: "2026-10-30T00:00:00.000Z" }]);
    const s2 = await loadAdminRequestPeriodSummary(all.sb, {
      table: "business_cash_charge_requests",
      timeColumn: "created_at",
      statusColumn: "status",
      amountColumn: "amount_minor",
      period: { fromDay: null, toDay: null, fromIso: null, toIso: null },
      buckets: CASH_CHARGE_SUMMARY_BUCKETS,
    });
    expect(all.calls).toHaveLength(1);
    expect(s2!.approved.amount).toBe(5000);
  });

  it("처리 기준 표 이름이 없으면 예전처럼 모두 신청 기준", () => {
    const s = summarizeAdminRequestRows([{ status: "PAID", amount: 1 }], COIN_WITHDRAWAL_SUMMARY_BUCKETS);
    expect(s.decidedBasis).toBe("requested");
    expect(s.approved.amount).toBe(1);
  });

  it("합계 줄 문구에 기준(신청 기준·처리 기준)을 적는다", () => {
    const src = readFileSync(
      path.join(process.cwd(), "components/admin/finance/AdminRequestPeriodSummaryLine.tsx"),
      "utf8"
    );
    /** 언어 SSOT B4: 문구는 카탈로그 키 — 코드 모양 + 카탈로그 값으로 확인 */
    expect(src).toContain(`t("admin_finance_by_request")`);
    expect(src).toContain(`t("admin_finance_by_processed")`);
    expect(MESSAGES.ko.admin_finance_by_request).toMatch(/신청 기준/);
    expect(MESSAGES.ko.admin_finance_by_processed).toMatch(/처리 기준/);
  });
});
