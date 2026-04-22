"use client";

import { getCategories } from "./getCategories";
import { getHomeChipCategories } from "./getHomeChipCategories";
import type { CategoryType, CategoryWithSettings } from "./types";

const TYPE_ORDER: CategoryType[] = ["trade", "service", "community", "feature"];

/**
 * 글쓰기 런처(FAB 등): 루트 + 글쓰기 가능 + **퀵메뉴(런처) 노출**(`quick_create_enabled`).
 * 관리자 `/admin/menus/trade`에서 항목별로 켜고, 런처 순서·아이콘(icon_key)을 맞춥니다.
 *
 * TRADE 루트는 `getHomeChipCategories()`(상단 「전체」 옆 탭)과 **동일한 순서**를 우선 적용합니다.
 * `/home` 에서 경로 슬러그 없이 런처만 열릴 때, 첫 줄이 탭의 첫 거래 메뉴(보통 중고거래)와 어긋나
 * 다른 루트로 저장되는 일을 줄입니다.
 */
export async function getWritableRootCategoriesForWriteLauncher(): Promise<CategoryWithSettings[]> {
  const all = await getCategories({ activeOnly: true });
  const roots = all.filter(
    (c) =>
      (c.parent_id == null || c.parent_id === "") &&
      c.settings?.can_write &&
      c.quick_create_enabled === true
  );
  const groupKey = (g: CategoryWithSettings["quick_create_group"]) => (g == null ? "\uFFFF" : g);

  let tradeChipOrder = new Map<string, number>();
  try {
    const chips = await getHomeChipCategories();
    tradeChipOrder = new Map(chips.map((c, i) => [c.id, i]));
  } catch {
    tradeChipOrder = new Map();
  }

  roots.sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a.type);
    const ib = TYPE_ORDER.indexOf(b.type);
    const da = ia === -1 ? 99 : ia;
    const db = ib === -1 ? 99 : ib;
    if (da !== db) return da - db;
    if (a.type === "trade" && b.type === "trade") {
      const ha = tradeChipOrder.has(a.id) ? tradeChipOrder.get(a.id)! : 10_000;
      const hb = tradeChipOrder.has(b.id) ? tradeChipOrder.get(b.id)! : 10_000;
      if (ha !== hb) return ha - hb;
    }
    const ga = groupKey(a.quick_create_group);
    const gb = groupKey(b.quick_create_group);
    if (ga !== gb) return ga.localeCompare(gb);
    const oa = a.quick_create_order ?? 0;
    const ob = b.quick_create_order ?? 0;
    if (oa !== ob) return oa - ob;
    return a.sort_order - b.sort_order;
  });
  return roots;
}
