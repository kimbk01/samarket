/**
 * focusProduct 진입 presentation contract — 일반 store top 진입과 분리.
 * SSOT: PREPARING → READY(reveal) → COMPLETE. 새 도메인 복제 금지.
 */

export type StoreMenuFocusEntryPhase = "idle" | "preparing" | "ready" | "complete";

/** READY sticky: 0 < stickyBottom < viewportHeight */
export function isStoreMenuFocusStickyGeometryReady(
  stickyBottomPx: number,
  viewportHeightPx: number
): boolean {
  return (
    Number.isFinite(stickyBottomPx) &&
    Number.isFinite(viewportHeightPx) &&
    stickyBottomPx > 0 &&
    stickyBottomPx < viewportHeightPx
  );
}

export function storeMenuFocusEntryNeedsPreparation(focusProductId: string | null | undefined): boolean {
  return Boolean(focusProductId?.trim());
}
