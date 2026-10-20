import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeFakeSupabase } from "@/lib/admin/__tests__/r7-delivery-b-fake-supabase";
import {
  ADMIN_BUSINESS_OPS_STORE_SCAN_RPC,
  loadAdminBusinessListOps,
} from "@/lib/admin-business/load-admin-business-list";
import {
  BUSINESS_OPS_DELIVERING_ORDER_STATUSES,
  BUSINESS_OPS_IN_PROGRESS_ORDER_STATUSES,
  presentStoreOpenKind,
} from "@/lib/admin-business/business-ops-presentation";

/**
 * R7 매장 운영 목록 — 전 매장 1회 DB 조회(admin_business_ops_store_scan) 위에서 영업 중 판정(TS 공개 매장 계약)·
 * 필터·KPI·정렬·쪽 나누기. 매장 50,000 루프·10,000/8,000/2,000/200 후보 상한 경로가 없어야 하고,
 * 잘린 응답이면 KPI 를 만들지 않는다.
 */
const ALWAYS_OPEN = {};
const CLOSED_HOURS = {
  auto_business_hours: { enabled: true, schedule_enforced: true, open: "00:00", close: "00:01", timezone: "Asia/Manila" },
};

function scanRow(i: number, over: Record<string, unknown> = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    store_name: `Store ${i}`,
    is_open: true,
    business_hours_json: ALWAYS_OPEN,
    approval_status: "approved",
    point_commerce_blocked: false,
    owner_user_id: `owner-${i}`,
    delivery_available: true,
    region: "Metro",
    city: "Makati",
    store_category_id: null,
    created_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    has_sales_permission: false,
    allowed_to_sell: null,
    sales_status: null,
    settle_outstanding: false,
    settle_review_required: false,
    open_report_count: 0,
    last_order_at: null,
    in_progress_order_count: 0,
    delivering_order_count: 0,
    q_match: true,
    ...over,
  };
}

function fixture(rows: Record<string, unknown>[], total = rows.length) {
  return makeFakeSupabase({ stores: [], store_orders: [], profiles: [], store_economic_point_accounts: [] }, (name) =>
    name === ADMIN_BUSINESS_OPS_STORE_SCAN_RPC
      ? { data: { total, rows, categories: [{ id: "cat-1", name: "Food" }] }, error: null }
      : { data: null, error: { message: "unknown" } }
  );
}

describe("R7 loadAdminBusinessListOps — full store scan", () => {
  it("passes q (≤ 80 chars) and order-status sets to the scan RPC; categories from DB", async () => {
    const f = fixture([scanRow(1)]);
    const longQ = "x".repeat(120);
    const res = await loadAdminBusinessListOps(f.sb as never, { q: `@${longQ}`, page: 1, pageSize: 20 });
    expect(res.ok).toBe(true);
    expect(f.rpcCalls[0]).toEqual({
      name: ADMIN_BUSINESS_OPS_STORE_SCAN_RPC,
      args: {
        p_q: "x".repeat(80),
        p_in_progress_statuses: [...BUSINESS_OPS_IN_PROGRESS_ORDER_STATUSES],
        p_delivering_statuses: [...BUSINESS_OPS_DELIVERING_ORDER_STATUSES],
      },
    });
    if (res.ok) expect(res.filterOptions.categories).toEqual([{ id: "cat-1", name: "Food" }]);
  });

  it("KPI counts every store (no cap): 260 stores, open-now from the TS hours contract", async () => {
    const rows = Array.from({ length: 260 }, (_, i) =>
      scanRow(i + 1, i % 4 === 0 ? { business_hours_json: CLOSED_HOURS } : i % 5 === 0 ? { is_open: false } : {})
    );
    const f = fixture(rows);
    const res = await loadAdminBusinessListOps(f.sb as never, { page: 1, pageSize: 20 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 기대값도 같은 TS 계약으로 계산 — 전 매장(260)이 판정 대상인지 확인한다
    const now = new Date();
    const kinds = rows.map((r) => presentStoreOpenKind(r.business_hours_json, r.is_open as boolean, now).kind);
    expect(res.kpi.totalStores).toBe(260);
    expect(res.kpi.openNow).toBe(kinds.filter((k) => k === "open").length);
    expect(res.kpi.closedNow).toBe(kinds.filter((k) => k === "closed").length);
    expect(kinds.filter((k) => k === "temp_closed").length).toBeGreaterThan(0);
    expect(res.total).toBe(260);
    // 매장 전수·판매 권한·신고·최근 주문을 상한으로 읽지 않는다
    expect(f.limitCalls()).toEqual([]);
    expect(f.calls.some((c) => ["store_sales_permissions", "store_sale_fee_obligations", "store_reports", "store_categories"].includes(c.table))).toBe(false);
  });

  it("pages walk the full filtered set without overlap (sort by last order, ties by created)", async () => {
    const rows = Array.from({ length: 95 }, (_, i) =>
      scanRow(i + 1, { last_order_at: i % 3 === 0 ? "2026-06-01T00:00:00Z" : null })
    );
    const f = fixture(rows);
    const seen: string[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const res = await loadAdminBusinessListOps(f.sb as never, { page, pageSize: 20, sort: "last_order" });
      if (!res.ok) throw new Error("load failed");
      expect(res.total).toBe(95);
      seen.push(...res.stores.map((s) => s.id));
    }
    expect(seen).toHaveLength(95);
    expect(new Set(seen).size).toBe(95);
  });

  it("DB facts drive filters and row values (q_match, sales restriction, settlement, reports, order counts)", async () => {
    const rows = [
      scanRow(1, { q_match: false }),
      scanRow(2, { has_sales_permission: true, allowed_to_sell: false, sales_status: "suspended", settle_outstanding: true, open_report_count: 12000, in_progress_order_count: 1000, delivering_order_count: 7, last_order_at: "2026-06-01T00:00:00Z" }),
    ];
    const f = fixture(rows);
    const q = await loadAdminBusinessListOps(f.sb as never, { q: "kim", page: 1, pageSize: 20 });
    if (!q.ok) throw new Error("load failed");
    expect(q.stores.map((s) => s.id)).toEqual([rows[1].id]);
    const row = q.stores[0];
    expect(row.openReportCount).toBe(12000);
    expect(row.inProgressOrderCount).toBe(1000);
    expect(row.deliveringOrderCount).toBe(7);
    expect(row.lastOrderAt).toBe("2026-06-01T00:00:00Z");
    expect(row.settlementKind).toBe("held");
    expect(row.salesAllowed).toBe(false);
    expect(q.kpi).toMatchObject({ restricted: 1, settlementNeedsCheck: 1, openReports: 1 });
    const restricted = await loadAdminBusinessListOps(f.sb as never, { restriction: "yes", page: 1, pageSize: 20 });
    if (!restricted.ok) throw new Error("load failed");
    expect(restricted.total).toBe(1);
  });

  it("truncated scan → error, never a partial KPI", async () => {
    const f = fixture([scanRow(1)], 2);
    const res = await loadAdminBusinessListOps(f.sb as never, { page: 1, pageSize: 20 });
    expect(res).toEqual({ ok: false, error: "store_scan_incomplete" });
  });

  it("source: no fixed scan caps left; migration is service_role only", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/admin-business/load-admin-business-list.ts"), "utf8");
    for (const cap of ["50_000", "limit(10_000)", "limit(8000)", "limit(2000)", "limit(200)", "Math.min(500"]) {
      expect(src, cap).not.toContain(cap);
    }
    const mig = readFileSync(resolve(process.cwd(), "supabase/migrations/20270601143000_r7_admin_business_ops_store_scan.sql"), "utf8");
    expect(mig).toMatch(/REVOKE ALL ON FUNCTION public\.admin_business_ops_store_scan\([^)]*\) FROM PUBLIC, anon, authenticated/);
    expect(mig).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_business_ops_store_scan\([^)]*\) TO service_role/);
  });
});
