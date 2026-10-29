import { describe, expect, it } from "vitest";
import {
  buildAdminStoreBulkPatchBody,
  parseAdminStoreBulkIds,
  summarizeAdminStoreBulkResults,
} from "@/lib/admin-business/admin-store-bulk";
import { summarizeAdminStoreAdLinks, summarizeAdminStoreMenuStats, parseAdminStoresExtraFilters } from "@/lib/admin-business/admin-stores-list-query";

const ID = "11111111-1111-4111-8111-111111111111";

describe("3-C B-2·B-3 bulk body (허용 항목만)", () => {
  it("노출·영업 중 여부·영업시간·반경만 단건 action 본문으로 옮긴다", () => {
    expect(buildAdminStoreBulkPatchBody({ action: "set_store_visible", enabled: false, reason: "정리" })).toEqual({
      ok: true,
      body: { action: "set_store_visible", enabled: false, reason: "정리" },
    });
    expect(buildAdminStoreBulkPatchBody({ action: "set_open", is_open: true, reason: "r1" })).toEqual({
      ok: true,
      body: { action: "set_delivery_flags", is_open: true, reason: "r1" },
    });
    const r = buildAdminStoreBulkPatchBody({ action: "set_delivery_radius", delivery_radius_km: 3, reason: "r1" });
    expect(r.ok && r.body).toMatchObject({ action: "set_delivery_radius", delivery_radius_km: 3 });
  });

  it("업종·이름·위치·메뉴 등은 일괄 불가", () => {
    for (const action of ["set_store_taxonomy", "set_store_name", "set_store_location", "approve_sales", "delete"]) {
      expect(buildAdminStoreBulkPatchBody({ action, reason: "r1" })).toEqual({ ok: false, error: "bulk_action_not_allowed" });
    }
    // 단건 action 의 다른 필드는 옮기지 않는다 (delivery_available 등)
    const r = buildAdminStoreBulkPatchBody({ action: "set_open", is_open: true, reason: "r1", ...({ delivery_available: true } as object) });
    expect(r.ok && "delivery_available" in r.body).toBe(false);
  });

  it("id 파싱·상한", () => {
    expect(parseAdminStoreBulkIds([ID, ID, "x"])).toEqual({ ok: true, ids: [ID] });
    expect(parseAdminStoreBulkIds(new Array(3).fill(0).map((_, i) => ID.slice(0, -1) + i), 2)).toEqual({
      ok: false,
      error: "too_many_store_ids",
    });
    expect(summarizeAdminStoreBulkResults([{ store_id: ID, ok: true, status: 200 }, { store_id: "b", ok: false, status: 400 }])).toEqual({
      total: 2,
      success: 1,
      failed: 1,
    });
  });
});

describe("3-C L-2·L-3·L-7·L-9 list helpers", () => {
  it("kind·업종 필터 파싱 (형식 오류는 무시)", () => {
    expect(parseAdminStoresExtraFilters(new URLSearchParams(`kind=sample&category_id=${ID}&topic_id=bad`))).toEqual({
      kind: "sample",
      categoryId: ID,
      topicId: null,
    });
    expect(parseAdminStoresExtraFilters(new URLSearchParams("kind=other")).kind).toBeNull();
  });

  it("메뉴·옵션 수 (삭제 상품 제외)·연결 광고 건수", () => {
    const m = summarizeAdminStoreMenuStats([
      { store_id: "s1", product_status: "active", options_json: [{ options: [1, 2] }, { options: [3] }] },
      { store_id: "s1", product_status: "deleted", options_json: [{ options: [1] }] },
      { store_id: "s2", product_status: "hidden", options_json: null },
    ]);
    expect(m.get("s1")).toEqual({ menu_count: 1, option_count: 3 });
    expect(m.get("s2")).toEqual({ menu_count: 1, option_count: 0 });
    const a = summarizeAdminStoreAdLinks([
      { store_id: "s1", lifecycle_status: "ACTIVE" },
      { store_id: "s1", lifecycle_status: "ENDED" },
    ]);
    expect(a.get("s1")).toEqual({ linked_ad_count: 2, linked_ad_live_count: 1 });
  });
});
