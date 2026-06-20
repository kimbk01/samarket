import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";
import { CM_ROOM_KB_OFFSET_MIN_PX } from "@/lib/ui/messenger-chat-viewport-tuning";

/** Samsung OneUI 등 gesture nav 여유 — keyboard open 시 safe-bottom 과 중복되면 제거 */
export const CM_ROOM_NAVIGATION_GAP_PX = 48;

/** tail message ↔ composer top 목표 간격(px) */
export const CM_ROOM_TAIL_COMPOSER_GAP_MIN_PX = 8;
export const CM_ROOM_TAIL_COMPOSER_GAP_MAX_PX = 16;
export const CM_ROOM_TAIL_COMPOSER_GAP_DEFAULT_PX = 12;

export const CM_ROOM_VISIBLE_VIEWPORT_MIN_PX = 240;

/** Composer·timeline chrome 실측 후 scroll anchor에 알림 */
export const CM_ROOM_CHROME_HEIGHT_SYNC_EVENT = "cm-room-chrome-height-synced";

export type CmRoomVisibleViewportSnapshot = {
  visibleHeightPx: number;
  keyboardOpen: boolean;
  overlayGapPx: number;
  baselineClosedHeightPx: number;
};

/**
 * CM room layout height SSOT — `window.visualViewport.height` only.
 * Native shell inset / innerHeight 차감 금지 (이중 subtraction 방지).
 */
export function resolveCmRoomVisibleViewportHeightPx(minHeightPx = CM_ROOM_VISIBLE_VIEWPORT_MIN_PX): number {
  if (typeof window === "undefined") return minHeightPx;
  const vv = window.visualViewport;
  const raw = vv ? vv.height : window.innerHeight;
  return Math.max(minHeightPx, Math.round(raw));
}

export function resolveCmRoomVisualViewportOverlayGapPx(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height)));
}

/**
 * keyboard open — overlay gap(iOS/WK) 또는 closed baseline 대비 vv.height 축소(Android adjustResize).
 */
export function resolveCmRoomKeyboardOpenFromViewport(baselineClosedHeightPx: number): boolean {
  const overlayGapPx = resolveCmRoomVisualViewportOverlayGapPx();
  if (overlayGapPx >= CM_ROOM_KB_OFFSET_MIN_PX) return true;

  const visibleHeightPx = resolveCmRoomVisibleViewportHeightPx();
  if (baselineClosedHeightPx > 0 && visibleHeightPx <= baselineClosedHeightPx - CM_ROOM_NAVIGATION_GAP_PX) {
    return true;
  }

  return false;
}

export function resolveCmRoomComposerBottomPaddingPx(args: {
  keyboardOpen: boolean;
  iosOverlayKbOffsetPx: number;
  overlayGapPx: number;
}): number | null {
  if (!args.keyboardOpen) return null;
  if (
    isLikelyIosWebKit() &&
    args.iosOverlayKbOffsetPx >= CM_ROOM_KB_OFFSET_MIN_PX &&
    args.overlayGapPx >= CM_ROOM_KB_OFFSET_MIN_PX
  ) {
    return args.iosOverlayKbOffsetPx;
  }
  return 0;
}

/** timeline scroll box = visible − (shell top→timeline top) − (trade dock + composer) */
export function resolveCmRoomTimelineHeightPx(args: {
  visibleHeightPx: number;
  timelineTopOffsetPx: number;
  footerChromeHeightPx: number;
  minTimelinePx?: number;
}): number {
  const minTimelinePx = args.minTimelinePx ?? 1;
  const raw = args.visibleHeightPx - args.timelineTopOffsetPx - args.footerChromeHeightPx;
  return Math.max(minTimelinePx, Math.round(raw));
}

export function buildCmRoomVisibleViewportSnapshot(
  baselineClosedHeightPx: number
): CmRoomVisibleViewportSnapshot {
  const visibleHeightPx = resolveCmRoomVisibleViewportHeightPx();
  const overlayGapPx = resolveCmRoomVisualViewportOverlayGapPx();
  const keyboardOpen = resolveCmRoomKeyboardOpenFromViewport(baselineClosedHeightPx);
  const nextBaseline = keyboardOpen
    ? baselineClosedHeightPx
    : Math.max(baselineClosedHeightPx, visibleHeightPx);

  return {
    visibleHeightPx,
    keyboardOpen,
    overlayGapPx,
    baselineClosedHeightPx: nextBaseline,
  };
}
