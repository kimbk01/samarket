/**
 * 2026-11-27 최종 설계 단계 2 — 매장 이미지 GC 참조 묶음 읽기.
 * - 판정 = 매장 1곳 읽기(`loadStoreImageReferencedPaths`)와 같다
 * - 서버가 응답 행 수를 잘라도 빈 쪽까지 읽어 참조를 놓치지 않는다
 * - 다른 오류면 묶음 전체 건너뜀(fail-closed) · 없는 표는 참조 0
 * - 호출 수는 매장 수와 무관(표마다 쪽 수만큼)
 */
import { describe, expect, it } from "vitest";
import {
  loadStoreImageReferencedPaths,
  loadStoreImageReferencedPathsForStores,
  runStoreProductImagesOrphanGc,
} from "@/lib/stores/store-product-images-orphan-gc.server";

type Row = Record<string, unknown>;
type TableErr = { message: string; code?: string };

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333";

function img(sid: string, name: string): string {
  return `https://x.supabase.co/storage/v1/object/public/store-product-images/${sid}/${name}`;
}

function dataset(): Record<string, Row[]> {
  const products: Row[] = [];
  for (let i = 0; i < 7; i++) {
    products.push({ id: `p${i}`, store_id: S1, thumbnail_url: img(S1, `p${i}.webp`), images_json: null, description_html: null });
  }
  products.push({ id: "q1", store_id: S2, thumbnail_url: img(S2, "q1.webp"), images_json: [img(S2, "q1b.webp")], description_html: null });
  return {
    stores: [
      { id: S1, logo_url: img(S1, "logo.webp") },
      { id: S2, logo_url: null },
    ],
    store_products: products,
    store_banners: [{ id: "b1", store_id: S2, image_url: img(S2, "banner.webp") }],
    store_notices: [],
    gift_certificate_products: [],
    gift_certificate_applications: [],
  };
}

function fakeSb(opts: { tables: Record<string, Row[]>; cap?: number; errors?: Record<string, TableErr>; folders?: string[] }) {
  const calls: { table: string; mode: "eq" | "in" }[] = [];
  const cap = opts.cap ?? 1000;
  const from = (table: string) => {
    const st: { col?: string; vals?: string[]; mode?: "eq" | "in"; lo?: number; hi?: number } = {};
    const run = () => {
      calls.push({ table, mode: st.mode ?? "eq" });
      const err = opts.errors?.[table];
      if (err) return { data: null, error: err };
      let rows = (opts.tables[table] ?? []).filter((r) => (st.vals ?? []).includes(String(r[st.col ?? ""])));
      rows = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      if (st.lo != null && st.hi != null) rows = rows.slice(st.lo, Math.min(st.hi + 1, st.lo + cap));
      return { data: rows, error: null };
    };
    const b = {
      select: () => b,
      eq: (col: string, v: string) => ((st.col = col), (st.vals = [v]), (st.mode = "eq"), b),
      in: (col: string, v: string[]) => ((st.col = col), (st.vals = v), (st.mode = "in"), b),
      order: () => b,
      range: (lo: number, hi: number) => ((st.lo = lo), (st.hi = hi), Promise.resolve(run())),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  const storage = {
    from: () => ({
      list: async (prefix: string) => {
        if (prefix === "") return { data: (opts.folders ?? []).map((name) => ({ name, id: null })), error: null };
        return { data: [], error: null };
      },
      remove: async () => ({ error: null }),
    }),
  };
  return { sb: { from, storage } as never, calls };
}

describe("묶음 읽기 = 매장 1곳 읽기", () => {
  it("매장마다 같은 참조 경로·매장 존재 여부", async () => {
    const { sb } = fakeSb({ tables: dataset() });
    const batched = await loadStoreImageReferencedPathsForStores(sb, [S1, S2, S3]);
    expect(batched).not.toBeNull();
    for (const sid of [S1, S2, S3]) {
      const single = await loadStoreImageReferencedPaths(fakeSb({ tables: dataset() }).sb, sid);
      expect(single.ok).toBe(true);
      if (!single.ok) continue;
      expect([...batched!.get(sid)!.paths].sort()).toEqual([...single.paths].sort());
      expect(batched!.get(sid)!.storeExists).toBe(single.storeExists);
    }
    expect([...batched!.get(S1)!.paths].length).toBeGreaterThan(0);
    expect(batched!.get(S3)!.storeExists).toBe(false);
  });

  it("서버가 응답을 3행으로 잘라도 빈 쪽까지 읽어 7개 상품 참조를 모두 모은다", async () => {
    const full = await loadStoreImageReferencedPathsForStores(fakeSb({ tables: dataset() }).sb, [S1]);
    const { sb, calls } = fakeSb({ tables: dataset(), cap: 3 });
    const capped = await loadStoreImageReferencedPathsForStores(sb, [S1]);
    expect([...capped!.get(S1)!.paths].sort()).toEqual([...full!.get(S1)!.paths].sort());
    // 상품 7행 = 3 + 3 + 1 + 빈 쪽 → 4번
    expect(calls.filter((c) => c.table === "store_products").length).toBe(4);
  });

  it("다른 오류 → null(묶음 전체 건너뜀) · 없는 표 → 참조 0 으로 계속", async () => {
    const failed = await loadStoreImageReferencedPathsForStores(
      fakeSb({ tables: dataset(), errors: { store_banners: { message: "timeout" } } }).sb,
      [S1, S2]
    );
    expect(failed).toBeNull();
    const missing = await loadStoreImageReferencedPathsForStores(
      fakeSb({ tables: dataset(), errors: { store_notices: { message: "x", code: "42P01" } } }).sb,
      [S1, S2]
    );
    expect(missing).not.toBeNull();
    expect(missing!.get(S2)!.paths.size).toBeGreaterThan(0);
  });
});

describe("GC 실행", () => {
  it("매장 수와 무관하게 표마다 묶음 읽기 · 매장별 eq 읽기 없음", async () => {
    const { sb, calls } = fakeSb({ tables: dataset(), folders: [S1, S2, S3] });
    const out = await runStoreProductImagesOrphanGc({ sb, dryRun: true });
    expect(out.ok).toBe(true);
    expect(calls.some((c) => c.mode === "eq")).toBe(false);
    // 표 6개 × (데이터 쪽 1 + 빈 쪽 1) 이하
    expect(calls.length).toBeLessThanOrEqual(12);
    if (!out.ok) return;
    expect(out.result.stores_scanned).toBe(2);
    expect(out.result.stores.find((r) => r.store_id === S3)?.skipped).toBe("store_missing");
  });

  it("참조 읽기 실패 → 묶음 매장 전부 reference_query_failed (지우지 않음)", async () => {
    const { sb } = fakeSb({ tables: dataset(), folders: [S1, S2], errors: { store_products: { message: "boom" } } });
    const out = await runStoreProductImagesOrphanGc({ sb, dryRun: false });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.stores.map((r) => r.skipped)).toEqual(["reference_query_failed", "reference_query_failed"]);
    expect(out.result.removed).toBe(0);
  });
});
