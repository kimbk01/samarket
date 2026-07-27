import { CM_ROOM_KB_OFFSET_MIN_PX } from "@/lib/ui/messenger-chat-viewport-tuning";

/** Samsung OneUI 등 gesture nav 여유 — keyboard open 시 safe-bottom 과 중복되면 제거 */
export const CM_ROOM_NAVIGATION_GAP_PX = 48;

/** tail message ↔ composer top 목표 간격(px) */
export const CM_ROOM_TAIL_COMPOSER_GAP_MIN_PX = 8;
export const CM_ROOM_TAIL_COMPOSER_GAP_MAX_PX = 16;
export const CM_ROOM_TAIL_COMPOSER_GAP_DEFAULT_PX = 8;

export const CM_ROOM_VISIBLE_VIEWPORT_MIN_PX = 240;

/** Composer·timeline chrome 실측 후 scroll anchor에 알림 */
export const CM_ROOM_CHROME_HEIGHT_SYNC_EVENT = "cm-room-chrome-height-synced";

export type CmRoomVisibleViewportSnapshot = {
  visibleHeightPx: number;
  keyboardOpen: boolean;
  overlayGapPx: number;
  baselineClosedHeightPx: number;
};

export type CmRoomShellVisualFramePx = {
  /** `visualViewport.height` (fallback: innerHeight) */
  heightPx: number;
  /** `visualViewport.offsetTop` — layout 좌표에서 가시 band 시작 */
  offsetTopPx: number;
  /** offsetTop + height — layout 좌표에서 가시 band 하단 */
  visualBottomPx: number;
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

/**
 * Shell must fill the *visual* viewport band, not only use vv.height at layout y=0.
 * iOS keyboard often raises `offsetTop` (focus scroll) — height-only leaves composer at visual top.
 */
export function resolveCmRoomShellVisualFramePx(
  minHeightPx = CM_ROOM_VISIBLE_VIEWPORT_MIN_PX
): CmRoomShellVisualFramePx {
  if (typeof window === "undefined") {
    return { heightPx: minHeightPx, offsetTopPx: 0, visualBottomPx: minHeightPx };
  }
  const vv = window.visualViewport;
  if (!vv) {
    const heightPx = Math.max(minHeightPx, Math.round(window.innerHeight));
    return { heightPx, offsetTopPx: 0, visualBottomPx: heightPx };
  }
  const heightPx = Math.max(minHeightPx, Math.round(vv.height));
  const offsetTopPx = Math.max(0, Math.round(vv.offsetTop));
  return {
    heightPx,
    offsetTopPx,
    visualBottomPx: offsetTopPx + heightPx,
  };
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

/**
 * Composer bottom padding authority.
 * - keyboard closed → null (CSS `--safe-bottom`)
 * - keyboard open → 0 (shell already sized to visual viewport band; never re-apply overlay gap)
 */
export function resolveCmRoomComposerBottomPaddingPx(args: {
  keyboardOpen: boolean;
}): number | null {
  if (!args.keyboardOpen) return null;
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

/** composer.bottom vs visual viewport bottom — PASS when |gap| is small */
export function resolveCmRoomComposerToVisualBottomGapPx(composerBottomCssPx: number): number {
  const frame = resolveCmRoomShellVisualFramePx();
  return Math.round(frame.visualBottomPx - composerBottomCssPx);
}
