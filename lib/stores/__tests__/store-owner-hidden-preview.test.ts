import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getStoreBySlugForViewer,
  resetApprovedStoreSlugCacheForTests,
  withOwnerHiddenPreviewFallback,
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

  it("미승인 매장 — 사장님 본인도 not_found", async () => {
    for (const approval_status of ["pending", "rejected", "suspended"]) {
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

  it("withOwnerHiddenPreviewFallback — 공용 성공·DB 오류·비로그인은 추가 조회 없음", async () => {
    const { sb, selects } = fakeSb(hidden);
    const okRes = await withOwnerHiddenPreviewFallback(sb, { ok: true, store: hidden }, "my-shop", "id", OWNER);
    expect(okRes).toMatchObject({ ok: true, ownerHiddenPreview: false });
    await withOwnerHiddenPreviewFallback(sb, { ok: false, reason: "db_error", message: "x" }, "my-shop", "id", OWNER);
    await withOwnerHiddenPreviewFallback(sb, { ok: false, reason: "not_found" }, "my-shop", "id", null);
    expect(selects).toHaveLength(0);
  });
});

describe("매장 화면 경로 — 본인 숨김 매장 열람 연결", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("summary·menus·legacy·후기·배너·공지 라우트가 본인 판정을 거친다", () => {
    expect(read("app/api/stores/[slug]/summary/route.ts")).toContain("fetchStoreSummaryOwnerHiddenPreview");
    expect(read("app/api/stores/[slug]/menus/route.ts")).toContain("fetchStoreMenusCatalogOwnerHiddenPreview");
    for (const r of ["route.ts", "reviews-summary/route.ts", "banners/route.ts", "notices/route.ts", "reviews/route.ts"]) {
      expect(read(`app/api/stores/[slug]/${r}`)).toContain("withOwnerHiddenPreviewFallback");
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

  it("매장 화면 — 숨김 상태 안내 표시", () => {
    const src = read("components/stores/StoreDetailPublic.tsx");
    expect(src).toContain("store_detail_owner_hidden_preview");
    expect(src).toContain("owner_hidden_preview");
  });
});
