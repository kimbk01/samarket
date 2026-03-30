/** 매장 카테고리 — Facebook 필터 칩에 가까운 라운드 pill */
export const STORE_CATEGORY_PILL_SCROLL =
  "flex gap-2 overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function storeCategoryPillClass(active: boolean): string {
  return [
    "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
    active ?
      "bg-[#E7F3FF] text-[#1877F2] dark:bg-[#263951] dark:text-[#4599FF]"
    : "bg-[#E4E6EB] text-[#050505] dark:bg-[#3A3B3C] dark:text-[#E4E6EB]",
  ].join(" ");
}
