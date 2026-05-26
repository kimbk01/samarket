/** 1단 헤더 오버레이(알림·검색 등) — FAB 등 하단 보조 UI 동기화 */
export const TIER1_HEADER_OVERLAY_OPEN = "kasama:tier1-header-overlay-open";
export const TIER1_HEADER_OVERLAY_CLOSE = "kasama:tier1-header-overlay-close";

export function dispatchTier1HeaderOverlayOpen(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TIER1_HEADER_OVERLAY_OPEN));
}

export function dispatchTier1HeaderOverlayClose(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TIER1_HEADER_OVERLAY_CLOSE));
}
