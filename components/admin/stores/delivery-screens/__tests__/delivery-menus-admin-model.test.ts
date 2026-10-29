import { describe, expect, it } from "vitest";
import type { DeliveryMenuAdminRow } from "@/lib/stores/delivery-menus/delivery-menu-types";
import {
  computeDeliveryMenuCoverage,
  isChildMenuShownAsTab,
  isMenuLiveNow,
  localInputToIso,
  moveSiblingOrder,
  storesForChildMenu,
  type DeliveryMenuAdminStore,
} from "../delivery-menus-admin-model";

const NOW = Date.parse("2026-10-29T00:00:00Z");

function menu(p: Partial<DeliveryMenuAdminRow> & { id: string }): DeliveryMenuAdminRow {
  return {
    slug: p.id,
    parent_id: null,
    primary_category_id: null,
    name_ko: p.id,
    name_en: null,
    icon_url: null,
    sort_order: 0,
    is_active: true,
    show_on_home: false,
    home_sort_order: 0,
    start_at: null,
    end_at: null,
    topic_ids: [],
    include_store_ids: [],
    exclude_store_ids: [],
    ...p,
  };
}

function store(id: string, cat: string | null, topic: string | null, visible = true): DeliveryMenuAdminStore {
  return {
    id,
    store_name: id,
    store_category_id: cat,
    store_topic_id: topic,
    is_visible: visible,
    approval_status: "approved",
  };
}

const categories = [
  { id: "food", name: "음식", slug: "food", is_active: true },
  { id: "mart", name: "마트", slug: "mart", is_active: true },
  { id: "hidden", name: "숨김", slug: "hidden", is_active: false },
];

describe("delivery-menus-admin-model", () => {
  it("2단 매장 = (연결 업종 ∪ 개별 추가) − 개별 제외, 1차 업종 안만", () => {
    const stores = [
      store("a", "food", "korean"),
      store("b", "food", "korean"),
      store("c", "food", "chinese"),
      store("d", "mart", "korean"),
      store("e", "food", null),
    ];
    const got = storesForChildMenu(
      { topic_ids: ["korean"], include_store_ids: ["c", "d"], exclude_store_ids: ["b"] },
      "food",
      stores
    ).map((s) => s.id);
    expect(got).toEqual(["a", "c"]);
    expect(storesForChildMenu({ topic_ids: [], include_store_ids: [], exclude_store_ids: [] }, "food", stores)).toEqual([]);
  });

  it("활성·기간 판정 · 빈 2단은 탭 아님", () => {
    expect(isMenuLiveNow(menu({ id: "x", start_at: "2026-11-01T00:00:00Z" }), NOW)).toBe(false);
    expect(isMenuLiveNow(menu({ id: "x", end_at: "2026-10-29T00:00:00Z" }), NOW)).toBe(false);
    expect(isMenuLiveNow(menu({ id: "x", is_active: false }), NOW)).toBe(false);
    expect(isChildMenuShownAsTab(menu({ id: "c", parent_id: "r" }), NOW)).toBe(false);
    expect(isChildMenuShownAsTab(menu({ id: "c", parent_id: "r", include_store_ids: ["a"] }), NOW)).toBe(true);
  });

  it("누락 현황 — 메뉴 없음 / 「전체」에서만", () => {
    const menus = [
      menu({ id: "r-food", primary_category_id: "food" }),
      menu({ id: "c-korean", parent_id: "r-food", topic_ids: ["korean"] }),
      menu({ id: "c-off", parent_id: "r-food", topic_ids: ["chinese"], is_active: false }),
      menu({ id: "r-hidden", primary_category_id: "hidden" }),
    ];
    const stores = [
      store("a", "food", "korean"),
      store("c", "food", "chinese"),
      store("m", "mart", "x"),
      store("n", null, null),
      store("h", "hidden", null),
      store("z", "mart", "x", false),
    ];
    const cov = computeDeliveryMenuCoverage(menus, categories, stores, NOW);
    expect(cov.uncovered.map((s) => s.id)).toEqual(["m", "n", "h"]);
    expect(cov.allTabOnly.map((s) => s.id)).toEqual(["c"]);
  });

  it("형제 순서 이동 → sort_order = index*10", () => {
    expect(moveSiblingOrder(["a", "b", "c"], "c", -1)).toEqual([
      { id: "a", sort_order: 0 },
      { id: "c", sort_order: 10 },
      { id: "b", sort_order: 20 },
    ]);
    expect(moveSiblingOrder(["a", "b"], "a", -1)).toBeNull();
  });

  it("기간 입력 빈 값 = 상시(null)", () => {
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("2026-11-01T10:00")).toMatch(/^2026-11-01T/);
  });
});
