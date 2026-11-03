import { describe, expect, it } from "vitest";
import {
  computePointChargeRequestPeriodSummary,
  computePointPeriodSummary,
  pickPointLedgerChainTail,
  pointPeriodBucket,
  resolvePointHistoryPeriod,
} from "@/lib/points/point-period-history";

const P = { period: "this_month" as const, fromDay: null, toDay: null, fromIso: null, toIso: null };

describe("Point 기간 합계 (설계 H-6·H-8)", () => {
  it("기간 미지정 = 이번 달(PHT), explicit:false · period=all 은 경계 없음", () => {
    const now = new Date("2026-11-03T10:00:00Z"); // PHT 11-03 18:00
    const def = resolvePointHistoryPeriod(new URLSearchParams(""), now);
    expect(def).toMatchObject({ period: "this_month", explicit: false, fromIso: "2026-10-31T16:00:00.000Z", toIso: "2026-11-03T16:00:00.000Z" });
    const all = resolvePointHistoryPeriod(new URLSearchParams("period=all"), now);
    expect(all).toMatchObject({ period: "all", explicit: true, fromIso: null, toIso: null });
    const custom = resolvePointHistoryPeriod(new URLSearchParams("period=custom&from=2026-10-01&to=2026-10-31"), now);
    expect(custom).toMatchObject({ fromIso: "2026-09-30T16:00:00.000Z", toIso: "2026-10-31T16:00:00.000Z" });
  });

  it("칸 분류 — 기존 분류 재사용 (충전·지급·환불·사용·회수)", () => {
    expect(pointPeriodBucket("charge", "point_charge", 1000)).toBe("charge");
    expect(pointPeriodBucket("reward", "community_reward", 10)).toBe("grant");
    expect(pointPeriodBucket("admin_adjust", "admin_manual", 50)).toBe("grant");
    expect(pointPeriodBucket("admin_adjust", "admin_manual", -50)).toBe("reclaim");
    expect(pointPeriodBucket("expire", "", -5)).toBe("reclaim");
    expect(pointPeriodBucket("reverse", "community_reclaim", -10)).toBe("reclaim");
    expect(pointPeriodBucket("spend", "promotion_order", -300)).toBe("use");
    // 보류·해제는 「보류 중」 (R3-g) — 승인 확정된 보류만 「사용」
    expect(pointPeriodBucket("ad_hold", "feed_ad_request", -200)).toBe("hold");
    expect(pointPeriodBucket("ad_hold", "promotion_order", -200)).toBe("hold");
    expect(pointPeriodBucket("ad_hold", "promotion_order", -200, true)).toBe("use");
    expect(pointPeriodBucket("ad_hold_release", "feed_ad_request", 200)).toBe("hold");
    expect(pointPeriodBucket("ad_hold_release", "promotion_order", 200)).toBe("hold");
    expect(pointPeriodBucket("ad_purchase", "feed_ad_request", 0)).toBeNull();
  });

  it("시작 + 적립 − 사용 = 종료 → consistent:true, 각 칸 합계", () => {
    // 내림차순 (최근 먼저) — 시작 잔액 100
    const rows = [
      { id: "4", amount: -30, balance_after: 1080, entry_type: "expire", related_type: "", created_at: "2026-11-03T04:00:00Z" },
      { id: "3", amount: -300, balance_after: 1110, entry_type: "spend", related_type: "promotion_order", created_at: "2026-11-02T04:00:00Z" },
      { id: "2", amount: 10, balance_after: 1410, entry_type: "reward", related_type: "community_reward", created_at: "2026-11-01T05:00:00Z" },
      { id: "1", amount: 1300, balance_after: 1400, entry_type: "charge", related_type: "point_charge", created_at: "2026-11-01T04:00:00Z" },
    ];
    const s = computePointPeriodSummary({ period: P, openingBalance: 100, rows });
    expect(s).toMatchObject({
      openingBalance: 100,
      closingBalance: 1080,
      charge: 1300,
      grant: 10,
      refund: 0,
      use: 300,
      reclaim: 30,
      totalCredit: 1310,
      totalDebit: 330,
      rowCount: 4,
      capped: false,
      consistent: true,
    });
  });

  it("줄 없음 → 종료 = 시작, 합계 0", () => {
    const s = computePointPeriodSummary({ period: P, openingBalance: 77, rows: [] });
    expect(s).toMatchObject({ openingBalance: 77, closingBalance: 77, totalCredit: 0, totalDebit: 0, consistent: true });
  });

  it("잔액 사슬이 끊기면 consistent:false (화면 「내역 합계가 맞지 않습니다」)", () => {
    const rows = [{ id: "1", amount: 50, balance_after: 999, entry_type: "charge", related_type: "point_charge", created_at: "2026-11-01T00:00:00Z" }];
    expect(computePointPeriodSummary({ period: P, openingBalance: 0, rows }).consistent).toBe(false);
  });

  it("상한 초과 → capped:true · consistent:null (조용히 틀린 합계 금지)", () => {
    const rows = [{ id: "1", amount: 5, balance_after: 5, entry_type: "reward", related_type: "", created_at: "2026-11-01T00:00:00Z" }];
    const s = computePointPeriodSummary({ period: P, openingBalance: 0, rows, rowCount: 6000, cap: 5000 });
    expect(s.capped).toBe(true);
    expect(s.consistent).toBeNull();
    expect(s.rowCount).toBe(6000);
  });

  it("같은 시각 여러 줄 — 다음 줄이 없는 줄을 마지막으로", () => {
    // 같은 트랜잭션: 100 → +200(300) → −50(250). 정렬상 첫 줄이 +200 이어도 마지막은 250.
    const rows = [
      { id: "b", amount: 200, balance_after: 300, created_at: "2026-11-01T00:00:00Z" },
      { id: "a", amount: -50, balance_after: 250, created_at: "2026-11-01T00:00:00Z" },
    ];
    expect(pickPointLedgerChainTail(rows)?.id).toBe("a");
  });

  it("충전 신청 기간 합계 — 신청·승인·반려·대기", () => {
    const s = computePointChargeRequestPeriodSummary([
      { request_status: "approved", payment_amount: 100, point_amount: 1000 },
      { request_status: "rejected", payment_amount: 50, point_amount: 500 },
      { request_status: "pending", payment_amount: 20, point_amount: 200 },
      { request_status: "on_hold", payment_amount: 10, point_amount: 100 },
      { request_status: "cancelled", payment_amount: 5, point_amount: 50 },
    ]);
    expect(s.requested).toEqual({ count: 5, paymentAmount: 185, pointAmount: 1850 });
    expect(s.approved).toEqual({ count: 1, paymentAmount: 100, pointAmount: 1000 });
    expect(s.rejected).toEqual({ count: 1, paymentAmount: 50, pointAmount: 500 });
    expect(s.pending).toEqual({ count: 2, paymentAmount: 30, pointAmount: 300 });
    expect(s.cancelled.count).toBe(1);
    expect(s.capped).toBe(false);
  });
});
