import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeFakeSupabase } from "@/lib/admin/__tests__/r7-delivery-b-fake-supabase";
import {
  ADMIN_BUSINESS_OPS_STORE_SCAN_RPC,
  ADMIN_BUSINESS_SELECT_ALL_MAX,
  loadAdminBusinessListOps,
  loadAdminBusinessListSelectAllIds,
  parseAdminBusinessListOpsFilters,
} from "@/lib/admin-business/load-admin-business-list";
import { buildAdminStoreBulkPatchBody } from "@/lib/admin-business/admin-store-bulk";
import {
  isoToManilaDateInput,
  manilaDateInputToIso,
  parseAdminStoreFeaturedPatch,
} from "@/lib/admin-business/admin-store-featured";
import { isAdminStorePatchAction } from "@/lib/admin-business/admin-store-patch-commands";

/**
 * 5-A (AB-01~04) — 매장 운영 목록: 유형·노출 필터, 전체 결과 선택, KPI(유형·노출 조건 + 샘플·숨김 제외 수치).
 * HS-07 — 추천 매장 PATCH/일괄 해석.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

function id(i: number) {
  return `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
}

function scanRow(i: number, over: Record<string, unknown> = {}) {
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
    ...over,
  };
}

/** 1~4 real(노출 1·2, 숨김 3·4) · 5~8 sample(노출 5·6, 숨김 7·8) · 9·10 legacy_test(노출) */
function fixture() {
  const kinds: Record<number, [string, boolean]> = {
    1: ["real", true],
    2: ["real", true],
    3: ["real", false],
    4: ["real", false],
    5: ["sample", true],
    6: ["sample", true],
    7: ["sample", false],
    8: ["sample", false],
    9: ["legacy_test", true],
    10: ["legacy_test", true],
  };
  const scan = Object.keys(kinds).map((k) =>
    scanRow(Number(k), Number(k) === 4 ? { approval_status: "pending", in_progress_order_count: 3 } : {})
  );
  const stores = Object.entries(kinds).map(([k, [kind, vis]]) => ({
    id: id(Number(k)),
    store_kind: kind,
    is_visible: vis,
    is_featured: Number(k) === 1,
    slug: `s-${k}`,
  }));
  return makeFakeSupabase({ stores, store_orders: [], profiles: [], store_economic_point_accounts: [] }, (name) =>
    name === ADMIN_BUSINESS_OPS_STORE_SCAN_RPC
      ? { data: { total: scan.length, rows: scan, categories: [] }, error: null }
      : { data: null, error: { message: "unknown" } }
  );
}

describe("5-A parseAdminBusinessListOpsFilters", () => {
  it("kind·visible·select_all 해석 (형식 밖 값은 전체)", () => {
    const f = parseAdminBusinessListOpsFilters(new URLSearchParams("kind=sample&visible=no&select_all=1"));
    expect(f).toMatchObject({ kind: "sample", visible: "no", selectAll: true });
    const bad = parseAdminBusinessListOpsFilters(new URLSearchParams("kind=evil&visible=maybe"));
    expect(bad).toMatchObject({ kind: "", visible: "", selectAll: false });
  });
});

describe("5-A loadAdminBusinessListOps — 유형·노출", () => {
  it("행에 storeKind·isVisible·isFeatured·slug 를 싣는다", async () => {
    const res = await loadAdminBusinessListOps(fixture().sb as never, { page: 1, pageSize: 20, sort: "name" });
    if (!res.ok) throw new Error("load failed");
    const s1 = res.stores.find((s) => s.id === id(1))!;
    expect(s1).toMatchObject({ storeKind: "real", isVisible: true, isFeatured: true, slug: "s-1" });
    const s7 = res.stores.find((s) => s.id === id(7))!;
    expect(s7).toMatchObject({ storeKind: "sample", isVisible: false, isFeatured: false });
  });

  it("kind·visible 필터가 목록 total 을 좁힌다", async () => {
    const sb = fixture().sb as never;
    const sample = await loadAdminBusinessListOps(sb, { page: 1, pageSize: 20, kind: "sample" });
    if (!sample.ok) throw new Error("load failed");
    expect(sample.total).toBe(4);
    const hiddenReal = await loadAdminBusinessListOps(sb, { page: 1, pageSize: 20, kind: "real", visible: "no" });
    if (!hiddenReal.ok) throw new Error("load failed");
    expect(hiddenReal.stores.map((s) => s.id).sort()).toEqual([id(3), id(4)]);
  });

  it("KPI 는 유형·노출 필터를 따르고, 샘플·숨김 제외 수치를 함께 낸다", async () => {
    const sb = fixture().sb as never;
    const all = await loadAdminBusinessListOps(sb, { page: 1, pageSize: 20 });
    if (!all.ok) throw new Error("load failed");
    expect(all.kpi.totalStores).toBe(10);
    // 샘플 아님 + 노출 중 = 1·2·9·10
    expect(all.kpi.operational.totalStores).toBe(4);
    expect(all.kpi.pendingApproval).toBe(1);
    expect(all.kpi.operational.pendingApproval).toBe(0);

    const real = await loadAdminBusinessListOps(sb, { page: 1, pageSize: 20, kind: "real" });
    if (!real.ok) throw new Error("load failed");
    expect(real.kpi.totalStores).toBe(4);
    expect(real.kpi.operational.totalStores).toBe(2);
    // 유형 필터가 있으면 진행 주문 = 해당 매장 합계
    expect(real.kpi.inProgressOrders).toBe(3);

    const sample = await loadAdminBusinessListOps(sb, { page: 1, pageSize: 20, kind: "sample" });
    if (!sample.ok) throw new Error("load failed");
    expect(sample.kpi.totalStores).toBe(4);
    expect(sample.kpi.operational.totalStores).toBe(0);
  });

  it("select_all 은 페이지와 무관하게 조건에 맞는 전체 id 를 돌려준다 (상한 있음)", async () => {
    const res = await loadAdminBusinessListSelectAllIds(fixture().sb as never, {
      page: 3,
      pageSize: 1,
      kind: "sample",
    });
    if (!res.ok) throw new Error("load failed");
    expect(res.ids.sort()).toEqual([id(5), id(6), id(7), id(8)]);
    expect(res).toMatchObject({ total: 4, truncated: false, max: ADMIN_BUSINESS_SELECT_ALL_MAX });
  });

  it("ops-list 라우트가 select_all 결과(ids)를 그대로 응답한다", () => {
    const route = read("app/api/admin/business/ops-list/route.ts");
    expect(route).toContain("loadAdminBusinessListSelectAllIds(sb, filters)");
    expect(route).toContain("truncated: all.truncated");
  });
});

describe("HS-07 추천 매장", () => {
  it("PATCH 액션 등록 + 해석 (끄기면 기간 비움, 종료 ≤ 시작 거부)", () => {
    expect(isAdminStorePatchAction("set_store_featured")).toBe(true);
    expect(parseAdminStoreFeaturedPatch({ enabled: false, featured_start_at: "2026-11-01T00:00:00Z" })).toEqual({
      ok: true,
      patch: { is_featured: false, featured_start_at: null, featured_end_at: null },
    });
    expect(parseAdminStoreFeaturedPatch({ enabled: true })).toEqual({
      ok: true,
      patch: { is_featured: true, featured_start_at: null, featured_end_at: null },
    });
    expect(
      parseAdminStoreFeaturedPatch({
        enabled: true,
        featured_start_at: "2026-11-02T00:00:00Z",
        featured_end_at: "2026-11-01T00:00:00Z",
      })
    ).toEqual({ ok: false, error: "featured_period_order" });
    expect(parseAdminStoreFeaturedPatch({ enabled: true, featured_start_at: "nope" })).toEqual({
      ok: false,
      error: "featured_period_invalid",
    });
    expect(parseAdminStoreFeaturedPatch({})).toEqual({ ok: false, error: "enabled_required" });
  });

  it("일괄 set_featured → 단건 set_store_featured 본문", () => {
    const r = buildAdminStoreBulkPatchBody({
      action: "set_featured",
      enabled: true,
      featured_start_at: "2026-11-01T00:00:00Z",
      reason: "추천 시작",
    });
    expect(r).toEqual({
      ok: true,
      body: {
        action: "set_store_featured",
        enabled: true,
        featured_start_at: "2026-11-01T00:00:00Z",
        featured_end_at: null,
        reason: "추천 시작",
      },
    });
  });

  it("마닐라 날짜 입력 ↔ ISO", () => {
    expect(manilaDateInputToIso("2026-11-01", "start")).toBe("2026-10-31T16:00:00.000Z");
    expect(manilaDateInputToIso("2026-11-01", "end")).toBe("2026-11-01T15:59:59.000Z");
    expect(isoToManilaDateInput("2026-10-31T16:00:00.000Z")).toBe("2026-11-01");
    expect(manilaDateInputToIso("bad", "start")).toBeNull();
  });

  it("실행 함수는 기존 auditOk 패턴으로 기록·캐시 무효화", () => {
    const src = read("lib/admin-business/execute-admin-store-patch-action.server.ts");
    const block = src.slice(src.indexOf('action === "set_store_featured"'), src.indexOf('action === "set_admin_memo"'));
    expect(block).toContain("parseAdminStoreFeaturedPatch(body)");
    expect(block).toContain("return auditOk(before, parsed.patch)");
  });

  it("매장 운영 상세 기본정보 탭에 추천 매장 편집기 장착", () => {
    const page = read("components/admin/business/AdminBusinessDetailPage.tsx");
    expect(page).toContain("<AdminStoreFeaturedEditor");
    expect(read("components/admin/business/AdminStoreFeaturedEditor.tsx")).toContain('"set_store_featured"');
  });
});

describe("5-A/5-E 화면 장착 (정적)", () => {
  it("매장 운영 목록에 일괄 바·샘플 삭제 드로어·선택·유형/노출 필터가 있다", () => {
    const page = read("components/admin/business/AdminBusinessListPage.tsx");
    expect(page).toContain("<AdminStoreListBulkBar");
    expect(page).toContain("<AdminSampleStoreDeleteDrawer");
    expect(page).toContain("togglePageAdminStoreSelection");
    expect(page).toContain("select_all=1");
    expect(page).toContain('"set_store_visible"');
    const bar = read("components/admin/business/AdminBusinessFilterBar.tsx");
    expect(bar).toContain("data-admin-biz-filter-kind");
    expect(bar).toContain("data-admin-biz-filter-visible");
    const table = read("components/admin/business/AdminBusinessTable.tsx");
    expect(table).toContain("data-admin-biz-row-visibility");
    expect(table).toContain('r.storeKind === "sample"');
    // 일괄 바 = 기존 API 재사용 (새 API 없음)
    expect(read("components/admin/stores/AdminStoreListBulkBar.tsx")).toContain('"/api/admin/stores/bulk"');
    expect(read("components/admin/stores/AdminSampleStoreDeleteDrawer.tsx")).toContain('"/api/admin/stores/sample-delete"');
  });

  it("입점 심사는 표(시트)이며 일괄·유형 필터가 없고 scope=review 로 샘플을 뺀다", () => {
    const page = read("components/admin/stores/AdminStoresPage.tsx");
    expect(page).toContain("<AdminManagementTableViewport");
    expect(page).toContain("scope=review");
    expect(page).toContain('defaults: { status: "actionable", sort: "created_desc" }');
    for (const gone of ["AdminStoreListBulkBar", "AdminSampleStoreDeleteDrawer", "STORE_KIND_FILTER", "select_all"]) {
      expect(page, gone).not.toContain(gone);
    }
    const api = read("app/api/admin/stores/route.ts");
    expect(api).toContain("applyAdminStoresReviewScope(");
    expect(api).toContain("reviewScope: parseAdminStoresReviewScope(searchParams)");
  });
});
