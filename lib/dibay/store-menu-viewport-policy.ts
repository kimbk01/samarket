import type { MenuSection } from "@/lib/stores/group-store-products-by-menu";

/** 이 개수 초과 시 섹션 deferred hydrate */
export const MENU_DEFER_FLAT_THRESHOLD = 48;
/** 첫 paint 에는 첫 카테고리만 — 나머지는 deferred hydrate */
export const MENU_DEFER_INITIAL_SECTIONS = 1;
export const MENU_DEFER_HYDRATE_BATCH = 2;
export const MENU_ROW_ESTIMATE_PX = 130;
export const MENU_SECTION_HEAD_PX = 56;
export const MENU_VIRT_SECTION_THRESHOLD = 80;
/** 보드 전체가 크면 중간 크기 섹션도 가상화 */
export const MENU_VIRT_BOARD_FLAT_THRESHOLD = 64;
export const MENU_VIRT_SECTION_SOFT_THRESHOLD = 20;

export function countMenuBoardItems(sections: MenuSection[]): number {
  return sections.reduce((n, s) => n + s.items.length, 0);
}

export function shouldDeferMenuSectionHydration(sections: MenuSection[]): boolean {
  return countMenuBoardItems(sections) > MENU_DEFER_FLAT_THRESHOLD;
}

export function initialDeferredHydratedThroughIndex(sections: MenuSection[]): number {
  if (sections.length === 0) return -1;
  const maxIdx = sections.length - 1;
  let through = Math.min(MENU_DEFER_INITIAL_SECTIONS - 1, maxIdx);
  let items = 0;
  for (let i = 0; i <= through; i += 1) items += sections[i]?.items.length ?? 0;
  let i = through + 1;
  while (i < sections.length && items < MENU_DEFER_FLAT_THRESHOLD) {
    items += sections[i]?.items.length ?? 0;
    through = i;
    i += 1;
  }
  return through;
}

export function estimateDeferredSectionHeightPx(itemCount: number): number {
  return MENU_SECTION_HEAD_PX + Math.max(0, itemCount) * MENU_ROW_ESTIMATE_PX;
}

export function shouldVirtualizeMenuSection(
  sectionItemCount: number,
  boardFlatCount: number
): boolean {
  if (sectionItemCount >= MENU_VIRT_SECTION_THRESHOLD) return true;
  return (
    boardFlatCount >= MENU_VIRT_BOARD_FLAT_THRESHOLD &&
    sectionItemCount >= MENU_VIRT_SECTION_SOFT_THRESHOLD
  );
}
