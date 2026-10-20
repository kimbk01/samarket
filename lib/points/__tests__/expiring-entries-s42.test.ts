import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  allocateExpiringEntries,
  computeExpiringPointsFromLedger,
  groupExpiringEntriesByMonth,
} from "@/lib/points/point-expire-utils";
import { mypageDateGroupKey } from "@/lib/mypage/format-mypage-date";
import {
  formatExpiringMonthLabel,
  normalizePointsLegacyViewQuery,
  pointsHistoryFilterForTab,
  countCancellableChargeRequests,
  POINTS_SCREEN_TAB_VALUES,
  resolvePromotionsBackHref,
} from "@/lib/points/points-screen-tabs";
import type { PointChargeRequest } from "@/lib/types/point";

const NOW = "2026-10-20T00:00:00.000Z";
const row = (amount: number, expires_at: string) => ({ amount, expires_at, expired_amount: null });

describe("A8·S42 소멸 예정 적립분 FIFO 배분", () => {
  const rows = [row(300, "2026-11-05T00:00:00.000Z"), row(500, "2026-12-10T00:00:00.000Z"), row(200, "2027-01-02T00:00:00.000Z")];

  it("잔액 ≥ 원장 합 → 적립분 그대로, 합 = 합계", () => {
    const e = allocateExpiringEntries(rows, 5000, NOW);
    expect(e.map((x) => x.amount)).toEqual([300, 500, 200]);
    expect(e.reduce((s, x) => s + x.amount, 0)).toBe(computeExpiringPointsFromLedger(rows, 5000, NOW).totalExpiringPoint);
  });

  it("잔액 < 원장 합 → 늦은 달부터 깎인다(빠른 만료분 먼저 채움)", () => {
    const e = allocateExpiringEntries(rows, 600, NOW);
    expect(e).toEqual([
      { expiresAt: "2026-11-05T00:00:00.000Z", amount: 300 },
      { expiresAt: "2026-12-10T00:00:00.000Z", amount: 300 },
    ]);
    expect(e.reduce((s, x) => s + x.amount, 0)).toBe(computeExpiringPointsFromLedger(rows, 600, NOW).totalExpiringPoint);
  });

  it("음수·0 잔액 → 빈 배열(합계 0 과 같음), 만료·과거 행 제외", () => {
    expect(allocateExpiringEntries(rows, -38, NOW)).toEqual([]);
    expect(allocateExpiringEntries([{ amount: 100, expires_at: "2026-01-01T00:00:00Z", expired_amount: null }], 999, NOW)).toEqual([]);
    expect(allocateExpiringEntries([{ amount: 100, expires_at: "2026-12-01T00:00:00Z", expired_amount: 100 }], 999, NOW)).toEqual([]);
  });

  it("월 경계는 필리핀 시간(UTC+8) — UTC 15:59 는 같은 날, 16:00 은 다음 달", () => {
    const entries = [
      { expiresAt: "2026-11-30T15:59:00.000Z", amount: 10 },
      { expiresAt: "2026-11-30T16:00:00.000Z", amount: 20 },
      { expiresAt: "2026-11-02T00:00:00.000Z", amount: 5 },
    ];
    const months = groupExpiringEntriesByMonth(entries, (iso) => mypageDateGroupKey(iso, "month"));
    expect(months).toEqual([
      { monthKey: "2026-11", amount: 15, earliestExpiresAt: "2026-11-02T00:00:00.000Z" },
      { monthKey: "2026-12", amount: 20, earliestExpiresAt: "2026-11-30T16:00:00.000Z" },
    ]);
    expect(months.reduce((s, m) => s + m.amount, 0)).toBe(35);
  });

  it("월 표시 — 회원 언어", () => {
    expect(formatExpiringMonthLabel("2026-11", "ko")).toBe("2026년 11월");
    expect(formatExpiringMonthLabel("2026-11", "en")).toContain("2026");
    expect(formatExpiringMonthLabel("bad", "ko")).toBe("bad");
  });
});

describe("S40 탭 `?tab=` · view=charges 정규화", () => {
  it("탭 = [전체·적립·사용·충전]", () => {
    expect(POINTS_SCREEN_TAB_VALUES).toEqual(["all", "credit", "debit", "charges"]);
  });

  it("view=charges → tab=charges (다른 쿼리 유지), 없으면 null", () => {
    expect(normalizePointsLegacyViewQuery("?view=charges&from=customer-center")).toBe("from=customer-center&tab=charges");
    expect(normalizePointsLegacyViewQuery("?tab=credit")).toBeNull();
  });

  it("충전 탭은 내역 필터를 바꾸지 않는다(추가 요청 0)", () => {
    expect(pointsHistoryFilterForTab("charges", "credit")).toBe("credit");
    expect(pointsHistoryFilterForTab("debit", "credit")).toBe("debit");
  });

  it("대기 수 = pending·waiting_confirm 만(D19)", () => {
    const req = (requestStatus: PointChargeRequest["requestStatus"]) => ({ requestStatus }) as PointChargeRequest;
    expect(countCancellableChargeRequests([req("pending"), req("waiting_confirm"), req("on_hold"), req("approved")])).toBe(2);
  });

  it("S43 직접 진입 뒤로 — postId 있으면 판매물품, 없으면 포인트", () => {
    expect(resolvePromotionsBackHref("p1")).toBe("/mypage/products");
    expect(resolvePromotionsBackHref(null)).toBe("/mypage/points");
  });
});

/* ── A8 GET /api/me/points: 소멸 조회 실패를 0 으로 만들지 않는다 ── */
let expiringFails = false;
function fakeSb() {
  return {
    rpc: async () => ({ data: 500, error: null }),
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "gt", "lt", "not", "is", "in", "or", "gte", "lte"]) q[m] = () => q;
      q.maybeSingle = async () =>
        table === "profiles" ? { data: { points: 500, nickname: "n" }, error: null } : { data: null, error: null };
      q.then = (resolve: (v: unknown) => unknown) => {
        if (table === "point_ledger") {
          // 원장 내역·소멸 조회가 같은 테이블 — 소멸 조회(expired_amount 조건)만 실패시키기 어렵다 → 플래그로 분기
          return resolve(
            expiringFails && (q as { __exp?: boolean }).__exp
              ? { data: null, error: { message: "timeout" } }
              : { data: [{ id: "l1", amount: 500, created_at: "2026-09-01T00:00:00Z", expires_at: "2026-12-01T00:00:00Z", expired_amount: null, entry_type: "charge" }], error: null }
          );
        }
        return resolve({ data: [], error: null });
      };
      const origNot = q.not as () => unknown;
      q.not = () => {
        (q as { __exp?: boolean }).__exp = true;
        return origNot();
      };
      return q;
    },
  };
}
vi.mock("@/lib/auth/api-session", () => ({ requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }) }));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => fakeSb() }));

describe("A8 GET /api/me/points expiring", () => {
  beforeEach(() => {
    expiringFails = false;
  });

  async function get() {
    const { GET } = await import("@/app/api/me/points/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://localhost/api/me/points"));
    return (await res.json()) as Record<string, unknown>;
  }

  it("성공 — expiring.entries 포함, 합 = totalExpiringPoint", async () => {
    const j = await get();
    const exp = j.expiring as { totalExpiringPoint: number; entries: Array<{ amount: number }> };
    expect(Array.isArray(exp.entries)).toBe(true);
    expect(exp.entries.reduce((s, e) => s + e.amount, 0)).toBe(exp.totalExpiringPoint);
    expect(j).not.toHaveProperty("expiringError");
  });

  it("소멸 조회 실패 → expiring:null + expiringError:true (0 대체 금지)", async () => {
    expiringFails = true;
    const j = await get();
    expect(j.ok).toBe(true);
    expect(j.expiring).toBeNull();
    expect(j.expiringError).toBe(true);
  });
});
