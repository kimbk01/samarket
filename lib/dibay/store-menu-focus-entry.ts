/**
 * focusProduct 진입 presentation contract — 일반 store top 진입과 분리.
 * SSOT: PREPARING → READY(reveal) → COMPLETE. 새 도메인 복제 금지.
 */

export type StoreMenuFocusEntryPhase = "idle" | "preparing" | "ready" | "complete";

/** PREPARING 최소 노출 — 즉시 reveal 깜빡임 방지 */
export const STORE_MENU_FOCUS_ENTRY_MIN_PREPARING_MS = 120;

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
