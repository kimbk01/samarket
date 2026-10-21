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
  /** baseline 을 잰 레이아웃 폭 — 폭이 바뀌면(회전·분할) baseline 을 새로 잡는다 (KB-04) */
  baselineLayoutWidthPx: number;
};

export type CmRoomShellVisualFramePx = {
  heightPx: number;
  offsetTopPx: number;
  visualBottomPx: number;
};

/**
 * iOS only — pin `.messenger-page` to the visualViewport band while keyboard is open
 * (Telegram-style: composer sits on the keyboard). Android never uses this.
 * `null` → clear inline band styles (closed keyboard / non-iOS).
 */
export type CmRoomIosMessengerPageVisualBandPx = {
  topPx: number;
  heightPx: number;
};

export function resolveIosMessengerPageVisualBandPx(args: {
  keyboardOpen: boolean;
  frame: CmRoomShellVisualFramePx;
}): CmRoomIosMessengerPageVisualBandPx | null {
  if (!args.keyboardOpen) return null;
  return {
    topPx: args.frame.offsetTopPx,
    heightPx: args.frame.heightPx,
  };
}

/**
 * CM room layout height — `window.visualViewport.height` (Android adjustResize / iOS vv).
 * Native shell inset / innerHeight 차감 금지 (이중 subtraction 방지).
 */
export function resolveCmRoomVisibleViewportHeightPx(minHeightPx = CM_ROOM_VISIBLE_VIEWPORT_MIN_PX): number {
  if (typeof window === "undefined") return minHeightPx;
  const vv = window.visualViewport;
  const raw = vv ? vv.height : window.innerHeight;
  return Math.max(minHeightPx, Math.round(raw));
}

/**
 * Visual viewport band in layout coords.
 * iOS may raise offsetTop on keyboard/focus — height alone at y=0 is insufficient.
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
  return { heightPx, offsetTopPx, visualBottomPx: offsetTopPx + heightPx };
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
 * Composer bottom padding — matches Android open contract (0).
 * Shell already tracks visualViewport; never re-apply overlay gap as padding (iOS double compensation).
 * closed → null → CSS `--safe-bottom`.
 */
export function resolveCmRoomComposerBottomPaddingPx(args: {
  keyboardOpen: boolean;
}): number | null {
  if (!args.keyboardOpen) return null;
  return 0;
}

export function resolveCmRoomLayoutWidthPx(): number {
  if (typeof window === "undefined") return 0;
  return Math.round(window.innerWidth);
}

/**
 * KB-04 — 키보드 닫힘 baseline 은 같은 레이아웃 폭에서만 유효.
 * 회전·분할로 폭이 바뀌면 이전 방향의 높이를 버리고 현재 vv 높이에서 다시 시작한다
 * (세로 baseline 으로 가로 화면을 「키보드 열림」으로 오판하지 않는다).
 */
export function buildCmRoomVisibleViewportSnapshot(
  baselineClosedHeightPx: number,
  baselineLayoutWidthPx?: number
): CmRoomVisibleViewportSnapshot {
  const visibleHeightPx = resolveCmRoomVisibleViewportHeightPx();
  const overlayGapPx = resolveCmRoomVisualViewportOverlayGapPx();
  const layoutWidthPx = resolveCmRoomLayoutWidthPx();
  const widthChanged =
    typeof baselineLayoutWidthPx === "number" &&
    baselineLayoutWidthPx > 0 &&
    layoutWidthPx > 0 &&
    baselineLayoutWidthPx !== layoutWidthPx;
  const baseline = widthChanged ? visibleHeightPx : baselineClosedHeightPx;
  const keyboardOpen = resolveCmRoomKeyboardOpenFromViewport(baseline);
  const nextBaseline = keyboardOpen ? baseline : Math.max(baseline, visibleHeightPx);

  return {
    visibleHeightPx,
    keyboardOpen,
    overlayGapPx,
    baselineClosedHeightPx: nextBaseline,
    baselineLayoutWidthPx: layoutWidthPx,
  };
}
