/**
 * S2-03 — 배달 전역 오버레이 스토어(옵션 시트 · 장바구니 미리보기 · 다른 매장 담기 확인)는 라우트 범위다.
 * pathname 이 바뀌면 셋 다 닫는다 — 이전 화면의 시트가 새 화면 위에 남거나, portal 재마운트 시
 * 남아 있던 `productId` 로 시트가 다시 뜨는 일을 막는다.
 * 쿼리(`?sort=` 등)만 바뀌는 경우는 같은 화면이므로 닫지 않는다 (pathname 비교만).
 */
import { useStoreCartConflictUIStore } from "@/lib/stores/store-cart-conflict-ui-store";
import { useStoreCartPreviewUIStore } from "@/lib/stores/store-cart-preview-ui-store";
import { useStoreProductSheetUIStore } from "@/lib/stores/store-product-sheet-ui-store";

export function closeStoreCommerceRouteScopedOverlays(): void {
  if (useStoreProductSheetUIStore.getState().productId) {
    useStoreProductSheetUIStore.getState().closeSheet();
  }
  if (useStoreCartPreviewUIStore.getState().open) {
    useStoreCartPreviewUIStore.getState().closePreview();
  }
  const conflict = useStoreCartConflictUIStore.getState();
  if (conflict.open || conflict.bulkClearResolve) {
    /** bulk-clear 대기 Promise 는 false 로 끝난다 (closeConflict 계약) */
    conflict.closeConflict();
  }
}

/** 이전·현재 pathname 이 다를 때만 true — 최초 마운트·쿼리 변경은 false */
export function shouldCloseStoreCommerceOverlaysOnPathChange(
  prevPathname: string | null,
  nextPathname: string
): boolean {
  if (prevPathname == null) return false;
  const a = prevPathname.split("?")[0] ?? "";
  const b = nextPathname.split("?")[0] ?? "";
  return a !== b;
}
