/** 매장 카테고리 — 배민식 36px sticky pill */
export const STORE_CATEGORY_PILL_SCROLL =
  "flex gap-2 overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function storeCategoryPillClass(active: boolean): string {
  return active ? "delivery-category-chip delivery-category-chip--active" : "delivery-category-chip";
}
