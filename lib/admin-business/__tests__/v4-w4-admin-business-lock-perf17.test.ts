import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeFakeSupabase } from "@/lib/admin/__tests__/r7-delivery-b-fake-supabase";
import {
  ADMIN_BUSINESS_KIND_VISIBILITY_EXCEPTION_OR,
  ADMIN_BUSINESS_OPS_STORE_SCAN_RPC,
  loadAdminBusinessListOps,
} from "@/lib/admin-business/load-admin-business-list";
import { adminStoreVisibilityLockConfirmCopy } from "@/lib/admin-business/admin-store-visibility-lock-copy";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

function id(i: number) {
  return `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
}

function scanRow(i: number) {
  return {
    id: id(i),
    store_name: `Store ${i}`,
    is_open: true,
    business_hours_json: {},
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
  };
}

/**
 * 1·2 실매장 노출(기본값 — 예외 조회에 없음) · 3 실매장 관리자 숨김 잠금 · 4 샘플 노출.
 * 가짜 Supabase 는 `or()` 를 적용하지 않으므로, 예외 조회 결과를 「예외 행만 있는 표」로 흉내 낸다.
 */
function fixture() {
  const scan = [1, 2, 3, 4].map(scanRow);
  const stores = [
    { id: id(3), store_kind: "real", is_visible: false, is_featured: false, admin_visibility_locked: true, slug: "s-3" },
    { id: id(4), store_kind: "sample", is_visible: true, is_featured: true, admin_visibility_locked: false, slug: "s-4" },
  ];
  return makeFakeSupabase({ stores, store_orders: [], profiles: [], store_economic_point_accounts: [] }, (name) =>
    name === ADMIN_BUSINESS_OPS_STORE_SCAN_RPC
      ? { data: { total: scan.length, rows: scan, categories: [] }, error: null }
      : { data: null, error: { message: "unknown" } }
  );
}

describe("v4 PERF-17 — 매장 운영 목록: 유형·노출은 예외 매장만 조회", () => {
  it("stores 유형·노출 조회는 예외 조건(or)만 · 전 매장 무조건 조회 없음", async () => {
    const f = fixture();
    const res = await loadAdminBusinessListOps(f.sb as never, { page: 1, pageSize: 20, sort: "name" });
    expect(res.ok).toBe(true);
    const kindCalls = f.calls.filter(
      (c) => c.table === "stores" && c.ops.some(([op, a]) => op === "select" && String(a[0]).includes("store_kind"))
    );
    expect(kindCalls.length).toBeGreaterThan(0);
    for (const c of kindCalls) {
      expect(c.ops.find(([op]) => op === "or")?.[1][0]).toBe(ADMIN_BUSINESS_KIND_VISIBILITY_EXCEPTION_OR);
    }
    // 추천·잠금은 쪽 매장 id 로만
    const flagCall = f.calls.find(
      (c) => c.table === "stores" && c.ops.some(([op, a]) => op === "select" && String(a[0]).includes("admin_visibility_locked"))
    );
    expect(flagCall?.ops.some(([op]) => op === "in")).toBe(true);
  });

  it("KPI 정확성 유지: 예외에 없는 매장 = 실매장·노출", async () => {
    const res = await loadAdminBusinessListOps(fixture().sb as never, { page: 1, pageSize: 20 });
    if (!res.ok) throw new Error("load failed");
    expect(res.kpi.totalStores).toBe(4);
    // 운영 기준 = 샘플 아님 + 노출 → 1·2
    expect(res.kpi.operational.totalStores).toBe(2);
    const real = await loadAdminBusinessListOps(fixture().sb as never, { page: 1, pageSize: 20, kind: "real" });
    if (!real.ok) throw new Error("load failed");
    expect(real.total).toBe(3);
    const hidden = await loadAdminBusinessListOps(fixture().sb as never, { page: 1, pageSize: 20, visible: "no" });
    if (!hidden.ok) throw new Error("load failed");
    expect(hidden.stores.map((s) => s.id)).toEqual([id(3)]);
  });
});

describe("v4 UI-04 — 관리자 숨김 잠금 표시", () => {
  it("행에 adminVisibilityLocked·isFeatured 를 싣는다", async () => {
    const res = await loadAdminBusinessListOps(fixture().sb as never, { page: 1, pageSize: 20, sort: "name" });
    if (!res.ok) throw new Error("load failed");
    const byId = new Map(res.stores.map((s) => [s.id, s]));
    expect(byId.get(id(3))).toMatchObject({ storeKind: "real", isVisible: false, adminVisibilityLocked: true });
    expect(byId.get(id(4))).toMatchObject({ storeKind: "sample", isFeatured: true, adminVisibilityLocked: false });
    expect(byId.get(id(1))).toMatchObject({ storeKind: "real", isVisible: true, adminVisibilityLocked: false });
  });

  it("잠금 컬럼 미적용 오류면 잠금 없음으로 계속 (목록 실패 아님)", async () => {
    const f = fixture();
    const origFrom = f.sb.from.bind(f.sb);
    (f.sb as { from: (t: string) => unknown }).from = (table: string) => {
      const b = origFrom(table) as Record<string, unknown>;
      if (table !== "stores") return b;
      return new Proxy(b, {
        get(target, prop) {
          if (prop === "select") {
            return (cols: string) => {
              if (String(cols).includes("admin_visibility_locked")) {
                const failing: Record<string, unknown> = {
                  in: () => Promise.resolve({ data: null, error: { message: "column stores.admin_visibility_locked does not exist" } }),
                };
                return failing;
              }
              return (target.select as (c: string) => unknown)(cols);
            };
          }
          return target[prop as string];
        },
      });
    };
    const res = await loadAdminBusinessListOps(f.sb as never, { page: 1, pageSize: 20, sort: "name" });
    if (!res.ok) throw new Error("load failed");
    expect(res.stores).toHaveLength(4);
    // 잠금 없이 추천만 다시 조회 (가짜 표는 선택 열을 거르지 않으므로 호출만 확인)
    expect(
      f.calls.some((c) => c.table === "stores" && c.ops.some(([op, a]) => op === "select" && a[0] === "id, is_featured"))
    ).toBe(true);
  });

  it("목록 배지·확인창 설명 연결", () => {
    expect(read("components/admin/business/AdminBusinessTable.tsx")).toContain("data-admin-biz-row-visibility-locked");
    const list = read("components/admin/business/AdminBusinessListPage.tsx");
    expect(list).toContain("adminStoreVisibilityLockConfirmCopy(enable, ko)");
    expect(read("components/admin/stores/AdminStoreListBulkBar.tsx")).toContain("adminStoreVisibilityLockConfirmCopy(");
    expect(read("components/admin/stores/AdminStoreReviewPanel.tsx")).toContain("adminStoreVisibilityLockConfirmCopy(next, ko)");
  });

  it("숨김 설명 = 오너가 다시 켤 수 없음, 노출 설명 = 잠금 해제", () => {
    expect(adminStoreVisibilityLockConfirmCopy(false, true)).toContain("사장님이 다시 켤 수 없습니다");
    expect(adminStoreVisibilityLockConfirmCopy(true, true)).toContain("잠금도 풀려");
    expect(adminStoreVisibilityLockConfirmCopy(false, false)).toContain("owner cannot turn it back on");
  });
});
