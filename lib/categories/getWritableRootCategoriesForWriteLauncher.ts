"use client";

import { getCategories } from "./getCategories";
import { getHomeChipCategories } from "./getHomeChipCategories";
import type { CategoryType, CategoryWithSettings } from "./types";

const TYPE_ORDER: CategoryType[] = ["trade", "service", "community", "feature"];

/**
 * 글쓰기 런처(FAB 등)
 *
 * **거래(trade) 루트:** `/market` 상단 홈칩과 **동일 소스** — `getHomeChipCategories()` (= `show_in_home_chips` 거래 루트).
 * 그중 `can_write` 인 것만 런처에 올린다. (`quick_create_enabled` 와 불일치로 탭만 있고 런처만 없는 문제 방지)
 *
 * **거래 외** 루트: 기존처럼 `quick_create_enabled` + `can_write`.
 */
export async function getWritableRootCategoriesForWriteLauncher(): Promise<CategoryWithSettings[]> {
  const all = await getCategories({ activeOnly: true });
  const allById = new Map(all.map((c) => [c.id, c]));

  let tradeRoots: CategoryWithSettings[] = [];
  try {
    const chips = await getHomeChipCategories();
    tradeRoots = chips
      .map((chip) => allById.get(chip.id))
      .filter((c): c is CategoryWithSettings => Boolean(c?.settings?.can_write));
  } catch {
    tradeRoots = [];
  }

  const otherRoots = all.filter(
    (c) =>
      c.type !== "trade" &&
      (c.parent_id == null || c.parent_id === "") &&
      c.settings?.can_write &&
      c.quick_create_enabled === true
  );

  const groupKey = (g: CategoryWithSettings["quick_create_group"]) => (g == null ? "\uFFFF" : g);
  otherRoots.sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a.type);
    const ib = TYPE_ORDER.indexOf(b.type);
    const da = ia === -1 ? 99 : ia;
    const db = ib === -1 ? 99 : ib;
    if (da !== db) return da - db;
    const ga = groupKey(a.quick_create_group);
    const gb = groupKey(b.quick_create_group);
    if (ga !== gb) return ga.localeCompare(gb);
    const oa = a.quick_create_order ?? 0;
    const ob = b.quick_create_order ?? 0;
    if (oa !== ob) return oa - ob;
    return a.sort_order - b.sort_order;
  });

  return [...tradeRoots, ...otherRoots];
}
