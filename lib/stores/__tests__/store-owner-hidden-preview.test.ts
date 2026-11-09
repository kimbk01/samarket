import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getStoreBySlugForViewer,
  resetApprovedStoreSlugCacheForTests,
} from "@/lib/stores/get-approved-store-by-slug";

/**
 * 사장님 본인 숨김 매장 열람 (Owner 「본인 열람으로 수정」 2026-11-03).
 * 승인 매장 + 보는 사람 = 사장님 → 숨김이어도 열림. 다른 사람·비로그인·미승인 → 지금처럼 not_found.
 */
type Row = Record<string, unknown>;

function fakeSb(row: Row | null) {
  const selects: string[] = [];
  const sb = {
    from: () => ({
      select: (cols: string) => {
        selects.push(cols);
        return {
          eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
        };
      },
    }),
  } as unknown as SupabaseClient;
  return { sb, selects };
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
  beforeEach(() => resetApprovedStoreSlugCacheForTests());

  it("숨김 승인 매장 — 사장님 본인은 열림(ownerHiddenPreview)", async () => {
    const { sb } = fakeSb(hidden);
    const r = await getStoreBySlugForViewer(sb, "my-shop", "id, slug, approval_status, is_visible", OWNER);
    expect(r).toMatchObject({ ok: true, ownerHiddenPreview: true });
  });

  it("숨김 매장 — 다른 사람·비로그인은 not_found", async () => {
    for (const viewer of ["someone-else", null, ""]) {
      resetApprovedStoreSlugCacheForTests();
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
    expect(src).toContain("canSell={menuOpen || ownerHiddenPreview}");
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
