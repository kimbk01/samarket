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
 * Width-change memory (module scope — one room shell measures at a time; the hook passes only
 * `(baseline, width)`, so this keeps the room hook untouched).
 * - `closedHeightByWidth`: MEASURED closed heights only (an estimate is never stored here).
 * - `estimate`: baseline carried across a rotation with the keyboard open — identified by
 *   width + value, replaced by the first closed measurement.
 */
const cmRoomWidthMemory = {
  closedHeightByWidth: new Map<number, number>(),
  lastKeyboardOpen: false,
  estimate: null as { widthPx: number; heightPx: number } | null,
};
const CM_ROOM_CLOSED_HEIGHT_MEMORY = 4;
/** Shrink (fraction of an ESTIMATED closed height) that counts as open — estimate ≠ measurement. */
export const CM_ROOM_ESTIMATED_BASELINE_SHRINK_RATIO = 0.2;

function rememberCmRoomClosedHeight(widthPx: number, heightPx: number): void {
  if (!(widthPx > 0 && heightPx > 0)) return;
  const m = cmRoomWidthMemory.closedHeightByWidth;
  m.delete(widthPx);
  m.set(widthPx, heightPx);
  while (m.size > CM_ROOM_CLOSED_HEIGHT_MEMORY) {
    const oldest = m.keys().next().value;
    if (oldest === undefined) break;
    m.delete(oldest);
  }
}

/** Test-only — clear the width memory between cases. */
export function __resetCmRoomVisibleViewportWidthMemoryForTests(): void {
  cmRoomWidthMemory.closedHeightByWidth.clear();
  cmRoomWidthMemory.lastKeyboardOpen = false;
  cmRoomWidthMemory.estimate = null;
}

/**
 * KB-04 — 키보드 닫힘 baseline 은 같은 레이아웃 폭에서만 유효.
 * 폭이 바뀌면(회전·분할):
 * - 이전에 실측한 폭 → 그 실측 닫힘 높이;
 * - 키보드가 열린 채 회전(Android resize) → 이전 방향 실측 기하로 추정(`prev + prevW − W`, 기기 상수 없음).
 *   추정은 실측으로 취급하지 않는다 — 열림은 큰 축소(20%)일 때만, 첫 닫힘 측정에서 실측값으로 교체;
 * - 그 외 → 현재 vv 높이(키보드 닫힘 실측).
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

  const mem = cmRoomWidthMemory;
  let baseline = baselineClosedHeightPx;
  let estimated =
    mem.estimate != null &&
    mem.estimate.widthPx === layoutWidthPx &&
    mem.estimate.heightPx === baselineClosedHeightPx;
  if (widthChanged) {
    const known = mem.closedHeightByWidth.get(layoutWidthPx);
    const prevEstimated =
      mem.estimate != null &&
      mem.estimate.widthPx === baselineLayoutWidthPx &&
      mem.estimate.heightPx === baselineClosedHeightPx;
    const projected = Math.round(baselineClosedHeightPx + (baselineLayoutWidthPx ?? 0) - layoutWidthPx);
    if (typeof known === "number" && known > 0) {
      baseline = known;
      estimated = false;
    } else if (mem.lastKeyboardOpen && !prevEstimated && baselineClosedHeightPx > 0 && projected > visibleHeightPx) {
      baseline = projected;
      estimated = true;
    } else {
      baseline = visibleHeightPx;
      estimated = false;
    }
  }

  let keyboardOpen: boolean;
  if (estimated) {
    const threshold = Math.max(
      CM_ROOM_NAVIGATION_GAP_PX,
      Math.round(baseline * CM_ROOM_ESTIMATED_BASELINE_SHRINK_RATIO)
    );
    keyboardOpen =
      overlayGapPx >= CM_ROOM_KB_OFFSET_MIN_PX || (baseline > 0 && visibleHeightPx <= baseline - threshold);
  } else {
    keyboardOpen = resolveCmRoomKeyboardOpenFromViewport(baseline);
  }

  let nextBaseline: number;
  if (keyboardOpen) {
    nextBaseline = baseline;
    mem.estimate = estimated ? { widthPx: layoutWidthPx, heightPx: baseline } : null;
  } else {
    // Closed = a real measurement: an estimate is replaced by it, a measured baseline only grows.
    nextBaseline = estimated ? visibleHeightPx : Math.max(baseline, visibleHeightPx);
    mem.estimate = null;
    rememberCmRoomClosedHeight(layoutWidthPx, nextBaseline);
  }
  mem.lastKeyboardOpen = keyboardOpen;

  return {
    visibleHeightPx,
    keyboardOpen,
    overlayGapPx,
    baselineClosedHeightPx: nextBaseline,
    baselineLayoutWidthPx: layoutWidthPx,
  };
}
