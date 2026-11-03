/**
 * R3-j (재감사 2026-11-03) — 관리자 포인트 충전 상태 카드: 고른 기간(신청 시각)을 적용한다.
 * 기간 없음 = 전체 기간 (통합 대시보드와 같은 값).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { countPointChargesByStatus } from "@/lib/admin/shared-handlers/admin-point-charges-list";

type Row = { request_status: string; requested_at: string };

function fakeSb(rows: Row[]) {
  const ranges: Array<{ gte?: string; lt?: string }> = [];
  const from = () => {
    const filters: Array<(r: Row) => boolean> = [];
    const seen: { gte?: string; lt?: string } = {};
    ranges.push(seen);
    const q = {
      select: () => q,
      eq: (col: keyof Row, v: string) => {
        filters.push((r) => r[col] === v);
        return q;
      },
      gte: (col: keyof Row, v: string) => {
        seen.gte = String(col);
        filters.push((r) => r[col] >= v);
        return q;
      },
      lt: (col: keyof Row, v: string) => {
        seen.lt = String(col);
        filters.push((r) => r[col] < v);
        return q;
      },
      then: (resolve: (v: { count: number; error: null }) => unknown) =>
        resolve({ count: rows.filter((r) => filters.every((f) => f(r))).length, error: null }),
    };
    return q;
  };
  return { sb: { from } as unknown as SupabaseClient, ranges };
}

const rows: Row[] = [
  { request_status: "approved", requested_at: "2026-10-15T00:00:00.000Z" },
  { request_status: "approved", requested_at: "2026-11-02T00:00:00.000Z" },
  { request_status: "rejected", requested_at: "2026-11-03T00:00:00.000Z" },
  { request_status: "waiting_confirm", requested_at: "2026-09-01T00:00:00.000Z" },
];

describe("countPointChargesByStatus — 기간 적용", () => {
  it("기간 없음 = 전체 기간", async () => {
    const { sb, ranges } = fakeSb(rows);
    const c = await countPointChargesByStatus(sb);
    expect(c?.approved).toBe(2);
    expect(c?.waiting_confirm).toBe(1);
    expect(ranges.every((r) => !r.gte && !r.lt)).toBe(true);
  });

  it("기간 있음 = 신청 시각(requested_at) 기간 안의 건만", async () => {
    const { sb, ranges } = fakeSb(rows);
    const c = await countPointChargesByStatus(sb, {
      fromIso: "2026-10-31T16:00:00.000Z",
      toIso: "2026-11-30T16:00:00.000Z",
    });
    expect(c?.approved).toBe(1);
    expect(c?.rejected).toBe(1);
    expect(c?.waiting_confirm).toBe(0);
    expect(ranges.every((r) => r.gte === "requested_at" && r.lt === "requested_at")).toBe(true);
  });

  it("화면: 카드 기간 표시 · 실패 시 기간 합계 지움 · 대기 경고는 전체 기간", () => {
    const src = readFileSync(path.join(process.cwd(), "components/admin/points/AdminPointChargeListPage.tsx"), "utf8");
    expect(src).toMatch(/data-admin-point-charge-cards-period/);
    expect(src).toMatch(/전체 기간/);
    expect(src).toMatch(/setPeriodSummary\(null\)/);
    expect(src).toMatch(/waitingConfirmAllTime \?\? counts\.waiting/);
  });
});
