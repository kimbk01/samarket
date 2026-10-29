import { describe, expect, it } from "vitest";
import {
  normalizeSampleStoreDeletePreview,
  parseSampleStoreDeleteIds,
  planSampleStoreStorageRemoval,
  sampleStoreDeleteTokenSource,
  summarizeSampleStoreDeletePreview,
  summarizeSampleStoreDeleteResults,
} from "@/lib/admin-business/sample-store-delete-model";
import { buildSampleStoreDeleteConfirmToken } from "@/lib/admin-business/sample-store-delete.server";

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";

function raw(over: Record<string, unknown> = {}) {
  return {
    store_id: S1,
    exists: true,
    store_kind: "sample",
    store_name: "샘플 1",
    menu_count: 3,
    option_count: 4,
    section_count: 2,
    images: [{ path: `${S1}/a.l1.webp`, shared: false }],
    deletable: true,
    reasons: [],
    ...over,
  };
}

describe("3-C §9-4 sample store delete model", () => {
  it("실매장·테스트 매장은 DB 가 deletable 이라 해도 삭제 불가 (TS 재확인)", () => {
    expect(normalizeSampleStoreDeletePreview(raw({ store_kind: "real" }))?.deletable).toBe(false);
    expect(normalizeSampleStoreDeletePreview(raw({ store_kind: "legacy_test" }))?.deletable).toBe(false);
    expect(normalizeSampleStoreDeletePreview(raw())?.deletable).toBe(true);
    expect(normalizeSampleStoreDeletePreview(raw({ reasons: ["restrict_references"], deletable: false }))?.deletable).toBe(
      false
    );
  });

  it("없는 매장은 not_found 사유", () => {
    const p = normalizeSampleStoreDeletePreview({ store_id: S2, exists: false, deletable: false, reasons: [] });
    expect(p?.exists).toBe(false);
    expect(p?.reasons).toEqual(["not_found"]);
  });

  it("확인 토큰은 대상·건수가 바뀌면 달라지고, 순서와 무관하다", () => {
    const a = normalizeSampleStoreDeletePreview(raw())!;
    const b = normalizeSampleStoreDeletePreview(raw({ store_id: S2 }))!;
    const t1 = buildSampleStoreDeleteConfirmToken([a, b]);
    expect(buildSampleStoreDeleteConfirmToken([b, a])).toBe(t1);
    const aMoreMenus = normalizeSampleStoreDeletePreview(raw({ menu_count: 4 }))!;
    expect(buildSampleStoreDeleteConfirmToken([aMoreMenus, b])).not.toBe(t1);
    const aBlocked = normalizeSampleStoreDeletePreview(raw({ deletable: false, reasons: ["ad_campaign_not_ended"] }))!;
    expect(buildSampleStoreDeleteConfirmToken([aBlocked, b])).not.toBe(t1);
    expect(sampleStoreDeleteTokenSource([a])).toContain(S1);
  });

  it("Storage: 다른 행이 참조(공유)하는 파일 묶음은 제외, 원본은 파생본과 함께 삭제 대상", () => {
    const plan = planSampleStoreStorageRemoval(S1, [
      { path: `${S1}/keep.l1.webp`, shared: true },
      { path: `${S1}/keep.l1.hero.webp`, shared: false },
      { path: `${S1}/del.l1.webp`, shared: false },
      { path: `${S1}/onlyderiv.l1.feed.webp`, shared: false },
      { path: `${S2}/foreign.l1.webp`, shared: false },
      { path: `${S1}/../escape.webp`, shared: false },
    ]);
    expect(plan.originals).toEqual([`${S1}/del.l1.webp`]);
    expect(plan.derivativesOnly).toEqual([`${S1}/onlyderiv.l1.feed.webp`]);
    expect(plan.skippedShared).toBe(2);
    expect(plan.skippedForeign).toBe(2);
  });

  it("요약·결과 분리", () => {
    const previews = [
      normalizeSampleStoreDeletePreview(raw())!,
      normalizeSampleStoreDeletePreview(raw({ store_id: S2, store_kind: "real" }))!,
    ];
    const s = summarizeSampleStoreDeletePreview(previews);
    expect(s).toMatchObject({ requested: 2, deletable: 1, blocked: 1, menu_count: 6, image_count: 2 });
    expect(
      summarizeSampleStoreDeleteResults([
        { store_id: S1, outcome: "deleted" },
        { store_id: S2, outcome: "already_deleted" },
        { store_id: "x", outcome: "blocked" },
        { store_id: "y", outcome: "failed" },
      ])
    ).toEqual({ requested: 4, deleted: 1, already_deleted: 1, blocked: 1, failed: 1 });
  });

  it("요청 id: 중복·형식 오류 제거, 비어 있으면 오류", () => {
    expect(parseSampleStoreDeleteIds([S1, S1.toUpperCase(), "bad"])).toEqual({ ok: true, ids: [S1] });
    expect(parseSampleStoreDeleteIds([])).toEqual({ ok: false, error: "store_ids_required" });
  });
});
