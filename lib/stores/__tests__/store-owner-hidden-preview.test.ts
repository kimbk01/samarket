import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getStoreBySlugForViewer,
  resetApprovedStoreSlugCacheForTests,
} from "@/lib/stores/get-approved-store-by-slug";
import { invalidateAdminMembershipJudgmentCache } from "@/lib/admin/admin-membership";

/**
 * 사장님 본인 숨김 매장 열람 (Owner 「본인 열람으로 수정」 2026-11-03).
 * 승인 매장 + 보는 사람 = 사장님 → 숨김이어도 열림. 다른 사람·비로그인·미승인 → 지금처럼 not_found.
 */
type Row = Record<string, unknown>;

/**
 * 표별 가짜 클라이언트 — `selects` 는 stores 조회만 기록한다.
 * `admins` = 활성 관리자 membership 행(user_id → role), `profileStatus` = 보는 사람 회원 상태.
 */
function fakeSb(
  row: Row | null,
  opts: { admins?: Record<string, string>; profileStatus?: string; rpc?: (args: Row) => unknown } = {}
) {
  const selects: string[] = [];
  const adminReads: string[] = [];
  const rpcCalls: Row[] = [];
  const sb = {
    from: (table: string) => ({
      select: (cols: string) => {
        if (table === "stores") selects.push(cols);
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (col: string, v: unknown) => {
            filters[col] = v;
            return chain;
          },
          maybeSingle: async () => {
            if (table === "admin_memberships") {
              const uid = String(filters.user_id ?? "");
              adminReads.push(uid);
              const role = opts.admins?.[uid];
              return { data: role ? { id: `m-${uid}`, user_id: uid, role, status: "active" } : null, error: null };
            }
            if (table === "profiles") return { data: { status: opts.profileStatus ?? "active" }, error: null };
            return { data: row, error: null };
          },
        };
        return chain;
      },
    }),
    rpc: async (_fn: string, args: Row) => {
      rpcCalls.push(args);
      return { data: opts.rpc ? opts.rpc(args) : null, error: null };
    },
  } as unknown as SupabaseClient;
  return { sb, selects, adminReads, rpcCalls };
}

const OWNER = "owner-1";
const hidden: Row = {
  id: "s1",
  slug: "my-shop",
  approval_status: "approved",
  is_visible: false,
  owner_user_id: OWNER,
};

describe("getStoreBySlugForViewer", () => {
  beforeEach(() => {
    resetApprovedStoreSlugCacheForTests();
    invalidateAdminMembershipJudgmentCache();
  });

  it("숨김 승인 매장 — 사장님 본인은 열림(ownerHiddenPreview)", async () => {
    const { sb } = fakeSb(hidden);
    const r = await getStoreBySlugForViewer(sb, "my-shop", "id, slug, approval_status, is_visible", OWNER);
    expect(r).toMatchObject({ ok: true, ownerHiddenPreview: true });
  });

  it("숨김 매장 — 다른 사람·비로그인은 not_found", async () => {
    for (const viewer of ["someone-else", null, ""]) {
      resetApprovedStoreSlugCacheForTests();
      invalidateAdminMembershipJudgmentCache();
      const { sb } = fakeSb(hidden);
      const r = await getStoreBySlugForViewer(sb, "my-shop", "id, slug, approval_status, is_visible", viewer);
      expect(r).toEqual({ ok: false, reason: "not_found" });
    }
  });

  it("심사 중 매장(대기·심사·보완) — 사장님 본인은 열림, 승인 전 표시 (Owner 2026-11-10)", async () => {
    for (const approval_status of ["pending", "under_review", "revision_requested"]) {
      resetApprovedStoreSlugCacheForTests();
      const { sb } = fakeSb({ ...hidden, approval_status });
      const r = await getStoreBySlugForViewer(sb, "my-shop", "id, slug, approval_status, is_visible", OWNER);
      expect(r).toMatchObject({ ok: true, ownerHiddenPreview: true, ownerPreviewPending: true });
    }
  });

  it("심사 중 매장 — 다른 사람은 not_found", async () => {
    const { sb } = fakeSb({ ...hidden, approval_status: "pending" });
    const r = await getStoreBySlugForViewer(sb, "my-shop", "id, slug, approval_status, is_visible", "someone-else");
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });

  it("반려·중지 매장 — 사장님 본인도 not_found", async () => {
    for (const approval_status of ["rejected", "suspended"]) {
      resetApprovedStoreSlugCacheForTests();
      const { sb } = fakeSb({ ...hidden, approval_status });
      const r = await getStoreBySlugForViewer(sb, "my-shop", "id, slug, approval_status, is_visible", OWNER);
      expect(r).toEqual({ ok: false, reason: "not_found" });
    }
  });

  it("노출 매장 — 공용 결과 그대로(ownerHiddenPreview false)", async () => {
    const { sb } = fakeSb({ ...hidden, is_visible: true });
    const r = await getStoreBySlugForViewer(sb, "my-shop", "id, slug, approval_status, is_visible", "anyone");
    expect(r).toMatchObject({ ok: true, ownerHiddenPreview: false });
  });

  it("본인 판정 조회는 owner_user_id 를 중복 없이 붙인다", async () => {
    const { sb, selects } = fakeSb(hidden);
    await getStoreBySlugForViewer(sb, "my-shop", "id, slug, approval_status, is_visible", OWNER);
    expect(selects.at(-1)).toBe("id, slug, approval_status, is_visible, owner_user_id");
  });

  it("publicResult 를 넘기면 공용 조회 다시 안 함 · 공용 성공·DB 오류·비로그인은 본인 조회도 안 함", async () => {
    const { sb, selects } = fakeSb(hidden);
    const okRes = await getStoreBySlugForViewer(sb, "my-shop", "id", OWNER, {
      publicResult: { ok: true, store: hidden },
    });
    expect(okRes).toMatchObject({ ok: true, ownerHiddenPreview: false });
    await getStoreBySlugForViewer(sb, "my-shop", "id", OWNER, {
      publicResult: { ok: false, reason: "db_error", message: "x" },
    });
    await getStoreBySlugForViewer(sb, "my-shop", "id", null, { publicResult: { ok: false, reason: "not_found" } });
    expect(selects).toHaveLength(0);
  });

  it("본인 판정은 보는 사람별 15초 캐시 — 같은 매장 화면의 API 여러 개가 조회 1번", async () => {
    const { sb, selects } = fakeSb(hidden);
    const pub = { ok: false as const, reason: "not_found" as const };
    await getStoreBySlugForViewer(sb, "my-shop", "id, slug", OWNER, { publicResult: pub });
    await getStoreBySlugForViewer(sb, "my-shop", "id, slug", OWNER, { publicResult: pub });
    expect(selects).toHaveLength(1);
    // 다른 사람은 캐시를 같이 쓰지 않음
    await getStoreBySlugForViewer(sb, "my-shop", "id, slug", "someone-else", { publicResult: pub });
    expect(selects).toHaveLength(2);
  });
});

describe("매장 화면 경로 — 본인 숨김 매장 열람 연결", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("summary·menus·legacy·후기·배너·공지 라우트가 본인 판정을 거친다", () => {
    expect(read("app/api/stores/[slug]/summary/route.ts")).toContain("fetchStoreSummaryOwnerHiddenPreview");
    expect(read("app/api/stores/[slug]/menus/route.ts")).toContain("fetchStoreMenusCatalogOwnerHiddenPreview");
    for (const r of ["route.ts", "reviews-summary/route.ts", "banners/route.ts", "notices/route.ts", "reviews/route.ts"]) {
      expect(read(`app/api/stores/[slug]/${r}`)).toContain("getStoreBySlugForViewer");
    }
  });

  it("본인 전용 응답은 공용 캐시에 쓰지 않고 private, no-store", () => {
    const summary = read("app/api/stores/[slug]/summary/route.ts");
    expect(summary).toContain('"Cache-Control": "private, no-store"');
    const menus = read("app/api/stores/[slug]/menus/route.ts");
    expect(menus).toContain('"Cache-Control": "private, no-store"');
    const catalog = read("lib/stores/fetch-store-menus-catalog.ts");
    const fn = catalog.slice(catalog.indexOf("export async function fetchStoreMenusCatalogOwnerHiddenPreview"));
    expect(fn.slice(0, fn.indexOf("\n}\n"))).not.toContain("writeStoreMenusPublicServerCache");
  });

  it("DB 함수 — 노출 조건에 본인(p_user_id = owner_user_id)만 추가", () => {
    const sql = read("supabase/migrations/20271103120000_store_menus_snapshot_owner_hidden_preview.sql");
    expect(sql).toContain("OR (p_user_id IS NOT NULL AND st.owner_user_id = p_user_id)");
    expect(sql).toContain("st.approval_status = 'approved'");
  });

  it("DB 함수 — 심사 중 본인 열람 + 본인 미리보기에서만 숨김·임시 상품 (20271110120000)", () => {
    const sql = read("supabase/migrations/20271110120500_store_menus_snapshot_owner_preview_pending.sql");
    expect(sql).toContain("st.approval_status IN ('approved', 'pending', 'under_review', 'revision_requested')");
    expect(sql).toContain("AND NOT (st2.approval_status = 'approved' AND st2.is_visible = true)");
    expect(sql).toContain("((SELECT is_on FROM owner_preview) AND p.product_status IN ('hidden', 'draft'))");
  });

  it("매장 화면 — 본인 미리보기는 메뉴를 보여주고(판매 승인 전에도) 숨김·임시 표시", () => {
    const src = read("components/stores/StoreDetailPublic.tsx");
    expect(src).toContain("canSell={menuOpen || ownerHiddenPreview");
    expect(src).toContain("store_detail_owner_preview_pending");
    const card = read("components/stores/detail/ProductMenuCard.tsx");
    expect(card).toContain("store_owner_preview_product_hidden");
    expect(card).toContain("store_owner_preview_product_draft");
  });

  it("매장 화면 — 숨김 상태 안내 표시", () => {
    const src = read("components/stores/StoreDetailPublic.tsx");
    expect(src).toContain("store_detail_owner_hidden_preview");
    expect(src).toContain("owner_hidden_preview");
  });

  it("메뉴 — 노출 판정을 사본(route 메모리·counter row)보다 먼저 (숨김 매장 메뉴 사본이 다른 사람에게 나가지 않게)", () => {
    const src = read("app/api/stores/[slug]/menus/route.ts");
    const gateAt = src.indexOf("getApprovedStoreBySlug(gateSb, decoded, STORE_SELECT_MENUS_STORE)");
    const notFoundAt = src.indexOf('publicGate.reason === "not_found"');
    const memoryAt = src.indexOf("tryServeMenusFromRouteMemoryCache({");
    expect(gateAt).toBeGreaterThan(0);
    expect(notFoundAt).toBeGreaterThan(gateAt);
    expect(memoryAt).toBeGreaterThan(notFoundAt);
  });

  it("상품 상세 — 사장님 본인은 숨김 매장 상품도 열림 (매장 화면과 같은 판정)", () => {
    expect(read("app/api/stores/products/[productId]/route.ts")).toContain(
      "loadStoreProductPublicStore(sb, storeId, viewerId)"
    );
    expect(read("lib/stores/store-product-public-detail-loader.ts")).toContain("if (!store.is_visible && !ownerViewing) return null;");
  });
});

/**
 * 관리자 미리보기 (Owner 승인 설계 v3.2 §3-4-3 「어드민에서는 매장을 볼 수 있는 기능」 2026-11-10).
 * 사장님 본인이 아니고 활성 관리자면 상태 무관(반려·중지 포함)으로 연다. 비관리자는 지금처럼 not_found.
 */
describe("getStoreBySlugForViewer — 관리자 미리보기", () => {
  const ADMIN = "admin-1";
  const NOT_FOUND = { ok: false as const, reason: "not_found" as const };
  const COLS = "id, slug, approval_status, is_visible";

  beforeEach(() => {
    resetApprovedStoreSlugCacheForTests();
    invalidateAdminMembershipJudgmentCache();
  });

  it("활성 관리자 — 모든 상태(대기·심사·보완·반려·중지·승인 숨김)에서 열림, 고객에게 보이는지 = 아니오", async () => {
    for (const approval_status of ["pending", "under_review", "revision_requested", "rejected", "suspended", "approved"]) {
      resetApprovedStoreSlugCacheForTests();
      const { sb } = fakeSb({ ...hidden, approval_status }, { admins: { [ADMIN]: "admin" } });
      const r = await getStoreBySlugForViewer(sb, "my-shop", COLS, ADMIN);
      expect(r).toMatchObject({ ok: true, ownerHiddenPreview: false, adminPreview: true, publiclyVisible: false });
    }
  });

  it("공용 판정이 늦게 갱신돼 404 여도 실제로 승인·노출이면 고객에게 보이는지 = 예", async () => {
    const { sb } = fakeSb({ ...hidden, is_visible: true }, { admins: { [ADMIN]: "super_admin" } });
    const r = await getStoreBySlugForViewer(sb, "my-shop", COLS, ADMIN, { publicResult: NOT_FOUND });
    expect(r).toMatchObject({ ok: true, adminPreview: true, publiclyVisible: true });
  });

  it("비관리자 — 반려·중지·숨김 모두 not_found", async () => {
    for (const approval_status of ["rejected", "suspended", "approved", "pending"]) {
      resetApprovedStoreSlugCacheForTests();
      invalidateAdminMembershipJudgmentCache();
      const { sb } = fakeSb({ ...hidden, approval_status }, { admins: {} });
      const r = await getStoreBySlugForViewer(sb, "my-shop", COLS, "someone-else");
      expect(r).toEqual(NOT_FOUND);
    }
  });

  it("정지 회원 운영자(최고관리자 제외)는 거부, 정지 최고관리자는 열림 (AD-07 과 같은 규칙)", async () => {
    const a = fakeSb(hidden, { admins: { [ADMIN]: "admin" }, profileStatus: "suspended" });
    expect(await getStoreBySlugForViewer(a.sb, "my-shop", COLS, ADMIN)).toEqual(NOT_FOUND);
    resetApprovedStoreSlugCacheForTests();
    invalidateAdminMembershipJudgmentCache();
    const b = fakeSb(hidden, { admins: { [ADMIN]: "super_admin" }, profileStatus: "suspended" });
    expect(await getStoreBySlugForViewer(b.sb, "my-shop", COLS, ADMIN)).toMatchObject({ ok: true, adminPreview: true });
  });

  it("사장님 본인이면서 관리자 — 본인 미리보기가 우선(관리자 판정 조회 안 함)", async () => {
    const { sb, adminReads } = fakeSb(hidden, { admins: { [OWNER]: "admin" } });
    const r = await getStoreBySlugForViewer(sb, "my-shop", COLS, OWNER);
    expect(r).toMatchObject({ ok: true, ownerHiddenPreview: true });
    expect((r as { adminPreview?: boolean }).adminPreview).toBeUndefined();
    expect(adminReads).toHaveLength(0);
  });

  it("공용 캐시 미사용 — 관리자 결과는 보는 사람별 캐시에만, 다른 사람은 다시 판정해 not_found", async () => {
    const { sb, selects } = fakeSb(hidden, { admins: { [ADMIN]: "admin" } });
    expect(await getStoreBySlugForViewer(sb, "my-shop", COLS, ADMIN, { publicResult: NOT_FOUND })).toMatchObject({
      adminPreview: true,
    });
    await getStoreBySlugForViewer(sb, "my-shop", COLS, ADMIN, { publicResult: NOT_FOUND });
    expect(selects).toHaveLength(1);
    expect(await getStoreBySlugForViewer(sb, "my-shop", COLS, "someone-else", { publicResult: NOT_FOUND })).toEqual(
      NOT_FOUND
    );
    expect(selects).toHaveLength(2);
    // 공용 판정(publicResult 없이) 은 여전히 not_found — 관리자 결과가 공용 30s 캐시에 들어가지 않았다
    resetApprovedStoreSlugCacheForTests();
    const { getApprovedStoreBySlug } = await import("@/lib/stores/get-approved-store-by-slug");
    expect(await getApprovedStoreBySlug(sb, "my-shop", COLS)).toEqual(NOT_FOUND);
  });
});

describe("fetchStoreMenusCatalogAdminPreview — 사장님 미리보기와 같은 SQL 분기 읽기", () => {
  const ADMIN = "admin-1";
  beforeEach(() => {
    resetApprovedStoreSlugCacheForTests();
    invalidateAdminMembershipJudgmentCache();
  });

  const snapshot = {
    store: { id: "s1", slug: "my-shop", store_name: "My Shop", menu_sold_out_bottom: false },
    products: [],
    popular_stats: [],
    commerce: {},
    meta: { can_sell: false, viewer_favorited: true, favorite_count: 3, recent_order_count: 0 },
  };

  it("관리자 — RPC 를 p_user_id = 그 매장 owner_user_id 로 부르고 viewer_favorited 는 false 로 덮어쓴다", async () => {
    const { fetchStoreMenusCatalogAdminPreview } = await import("@/lib/stores/fetch-store-menus-catalog");
    const { sb, rpcCalls } = fakeSb({ ...hidden, store_name: "My Shop" }, { admins: { [ADMIN]: "admin" }, rpc: () => snapshot });
    const body = await fetchStoreMenusCatalogAdminPreview(sb, "my-shop", ADMIN);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({ p_store_slug: "my-shop", p_user_id: OWNER });
    expect(body?.meta).toMatchObject({ admin_preview: true, admin_preview_public_visible: false, viewer_favorited: false });
    expect(body?.meta.admin_preview_menu_unavailable).toBeUndefined();
  });

  it("비관리자 — RPC 를 부르지 않고 null", async () => {
    const { fetchStoreMenusCatalogAdminPreview } = await import("@/lib/stores/fetch-store-menus-catalog");
    const { sb, rpcCalls } = fakeSb(hidden, { admins: {}, rpc: () => snapshot });
    expect(await fetchStoreMenusCatalogAdminPreview(sb, "my-shop", "someone-else")).toBeNull();
    expect(await fetchStoreMenusCatalogAdminPreview(sb, "my-shop", null)).toBeNull();
    expect(rpcCalls).toHaveLength(0);
  });

  it("반려·중지 — DB 함수가 열지 않으면(빈 결과) 빈 메뉴 + 메뉴를 불러올 수 없는 상태 표시", async () => {
    const { fetchStoreMenusCatalogAdminPreview } = await import("@/lib/stores/fetch-store-menus-catalog");
    const { sb } = fakeSb(
      { ...hidden, approval_status: "rejected", store_name: "My Shop" },
      { admins: { [ADMIN]: "admin" }, rpc: () => null }
    );
    const body = await fetchStoreMenusCatalogAdminPreview(sb, "my-shop", ADMIN);
    expect(body?.products).toEqual([]);
    expect(body?.store).toMatchObject({ id: "s1", slug: "my-shop", store_name: "My Shop" });
    expect(body?.store).not.toHaveProperty("owner_user_id");
    expect(body?.meta).toMatchObject({ admin_preview: true, admin_preview_menu_unavailable: true, viewer_favorited: false });
  });
});

describe("매장 화면 경로 — 관리자 미리보기 연결", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("menus 라우트 — 본인 미리보기 다음에 관리자 미리보기, private no-store, 찜 합성 안 함", () => {
    const src = read("app/api/stores/[slug]/menus/route.ts");
    const ownerAt = src.indexOf("fetchStoreMenusCatalogOwnerHiddenPreview(gateSb");
    const adminAt = src.indexOf("fetchStoreMenusCatalogAdminPreview(gateSb, decoded, viewerId)");
    expect(ownerAt).toBeGreaterThan(0);
    expect(adminAt).toBeGreaterThan(ownerAt);
    const adminBlock = src.slice(adminAt, src.indexOf("\n    }\n", adminAt));
    expect(adminBlock).toContain('"Cache-Control": "private, no-store"');
    expect(adminBlock).not.toContain("composeStoreMenusCatalogForViewer");
    const catalog = read("lib/stores/fetch-store-menus-catalog.ts");
    const fn = catalog.slice(catalog.indexOf("export async function fetchStoreMenusCatalogAdminPreview"));
    expect(fn.slice(0, fn.indexOf("\n}\n"))).not.toContain("writeStoreMenusPublicServerCache");
  });

  it("summary·legacy — 관리자 미리보기 meta 와 private no-store", () => {
    const lib = read("lib/stores/fetch-store-summary-public.ts");
    expect(lib).toContain("admin_preview: true");
    expect(lib).toContain("admin_preview_public_visible: preview.publiclyVisible");
    expect(lib).toContain("admin_preview_menu_unavailable: true");
    const legacy = read("app/api/stores/[slug]/route.ts");
    expect(legacy).toContain("admin_preview: true");
    expect(legacy).toContain('storeRes.ownerHiddenPreview || storeRes.adminPreview ? { headers: { "Cache-Control": "private, no-store" } }');
  });

  it("매장 화면 — 띠(예/아니오)·메뉴 보이기·주문 막기·반려/중지 안내", () => {
    const src = read("components/stores/StoreDetailPublic.tsx");
    expect(src).toContain("store_detail_admin_preview_visible_yes");
    expect(src).toContain("store_detail_admin_preview_visible_no");
    expect(src).toContain("store_detail_admin_preview_menu_unavailable");
    expect(src).toContain("canSell={menuOpen || ownerHiddenPreview || adminPreview}");
    expect(src).toContain("ownerOrderBlocked || adminPreview ||");
    expect(src).toContain('t("store_detail_admin_preview_order_blocked")');
    const ko = read("lib/i18n/catalog/store-commerce-ui.ts");
    expect(ko).toContain('store_detail_admin_preview_visible_yes: "관리자 미리보기 · 고객에게 보이는지: 예"');
    expect(ko).toContain('store_detail_admin_preview_visible_no: "관리자 미리보기 · 고객에게 보이는지: 아니오"');
    expect(ko).toContain('store_detail_admin_preview_visible_yes: "Admin preview · Visible to customers: Yes"');
  });

  it("어드민 심사 패널 — 「고객 화면으로 보기」 새 탭, slug 없으면 비활성", () => {
    const src = read("components/admin/stores/AdminStoreReviewPanel.tsx");
    expect(src).toContain('t("admin_stores_view_as_customer")');
    expect(src).toContain("`/stores/${encodeURIComponent(customerSlug)}`");
    expect(src).toContain('target="_blank"');
    expect(src).toMatch(/AdminActionButton type="button" variant="secondary" disabled>\s*\{t\("admin_stores_view_as_customer"\)\}/);
  });
});
