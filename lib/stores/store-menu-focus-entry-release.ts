import {
  findMenuSectionIndexForProduct,
  type MenuSection,
} from "@/lib/stores/group-store-products-by-menu";

/**
 * C-03b — 검색·목록에서 `focusProduct` 로 상세 진입 시 「포커스 준비」 상태 해제 판정.
 * 메뉴 로드가 끝났는데 포커스 대상이 없으면(대상 id 없음 · 메뉴판 비어 있음 · 메뉴판에 상품 없음) 해제한다.
 * 이전에는 메뉴판이 비어 있으면 판정을 건너뛰어 준비 상태가 풀리지 않았다.
 */
export function shouldReleaseStoreMenuFocusEntry(input: {
  menusLoading: boolean;
  focusProductId: string | null | undefined;
  sections: readonly MenuSection[];
}): boolean {
  if (input.menusLoading) return false;
  const id = input.focusProductId?.trim();
  if (!id) return true;
  if (input.sections.length === 0) return true;
  return findMenuSectionIndexForProduct(input.sections as MenuSection[], id) < 0;
}
