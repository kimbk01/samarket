import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAdminActionQueueCountsRpcParams,
  loadAdminActionQueueCounts,
} from "@/lib/admin/admin-action-queue";

/**
 * 관리자 종 1회 조회 — `admin_action_queue_counts` 결과가 표별 조회와 같은 결과 모양이 되고,
 * 칸별 null 은 그 칸만 「확인 불가」, RPC 실패 시 기존 표별 조회로 간다.
 */
function legacyClient(counts: Record<string, number>, calls: string[]) {
  const chain = (table: string) => {
    const c: Record<string, unknown> = {};
    const done = () => {
      calls.push(table);
      return Promise.resolve({ count: counts[table] ?? 0, error: null, data: [] });
    };
    for (const m of ["select", "eq", "in", "or", "gte", "limit"]) {
      c[m] = () => c;
    }
    (c as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => done().then(res, rej);
    return c;
  };
  return { from: (t: string) => chain(t) };
}

describe("admin action queue counts via RPC", () => {
  it("RPC 1회로 같은 결과 모양 · 표별 조회 0", async () => {
    const calls: string[] = [];
    const rpc = vi.fn(async () => ({
      data: {
        store_charges: 0, cash_charges: 2, user_charges: 1, reports: 3, store_reports: 0, delivery_alerts: 0,
        feed_ad_rows: [], trade_promo_pending: 0, store_inquiry_open: 0, support_actionable: 1,
        community_reports: 0, store_applications: 4, delivery_ad_ops: 3, meeting_reports: 0, orders_attention: 5,
        settlements_actionable: 0, coin_withdrawals: 0, platform_popup_pending: 0, partner_pending: 0,
        messenger_actionable: null,
      },
      error: null,
    }));
    const sb = { ...legacyClient({}, calls), rpc } as unknown as SupabaseClient<any>;
    const r = await loadAdminActionQueueCounts({ storesSb: sb, notesSb: sb });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
    const byKey = Object.fromEntries(r.categories.map((c) => [c.key, c]));
    expect(byKey.cash_charges).toMatchObject({ status: "ok", count: 2 });
    expect(byKey.orders_attention).toMatchObject({ status: "ok", count: 5 });
    expect(byKey.reports).toMatchObject({ status: "ok", count: 3 });
    expect(byKey.messenger_actionable).toMatchObject({ status: "unavailable", count: null });
  });

  it("RPC 실패 → 기존 표별 조회", async () => {
    const calls: string[] = [];
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    const sb = { ...legacyClient({ reports: 3 }, calls), rpc } as unknown as SupabaseClient<any>;
    const r = await loadAdminActionQueueCounts({ storesSb: sb, notesSb: sb });
    expect(calls.length).toBeGreaterThanOrEqual(19);
    const byKey = Object.fromEntries(r.categories.map((c) => [c.key, c]));
    expect(byKey.reports).toMatchObject({ status: "ok", count: 3 });
  });

  it("RPC 호출이 예외를 던져도 기존 표별 조회", async () => {
    const calls: string[] = [];
    const rpc = vi.fn(async () => {
      throw new Error("network");
    });
    const sb = { ...legacyClient({ reports: 2 }, calls), rpc } as unknown as SupabaseClient<any>;
    const r = await loadAdminActionQueueCounts({ storesSb: sb, notesSb: sb });
    expect(calls.length).toBeGreaterThanOrEqual(19);
    expect(Object.fromEntries(r.categories.map((c) => [c.key, c])).reports).toMatchObject({ status: "ok", count: 2 });
  });

  it("조건값은 TS 상수에서 만든다", () => {
    const p = buildAdminActionQueueCountsRpcParams(new Date("2026-11-01T00:00:00Z"));
    expect(p.support_statuses).toEqual(["OPEN", "WAITING_ADMIN"]);
    expect(p.meeting_report_statuses).toEqual(["pending", "reviewing"]);
    expect(p.feed_ad_scan_limit).toBe(2000);
    expect(typeof p.order_active_from).toBe("string");
  });
});
