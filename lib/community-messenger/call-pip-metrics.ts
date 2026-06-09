/** PiP 4모서리 앵커 — 카카오톡/텔레그램식 스냅 */
export type CallPipCorner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export const CALL_PIP_CORNERS: readonly CallPipCorner[] = [
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
] as const;

export const CALL_PIP_DEFAULT_CORNER: CallPipCorner = "bottomRight";

export const CALL_PIP_MIN_WIDTH_PX = 110;
export const CALL_PIP_MAX_WIDTH_PX = 140;
export const CALL_PIP_WIDTH_RATIO = 0.32;
export const CALL_PIP_MARGIN_SIDE_PX = 12;
export const CALL_PIP_MARGIN_BOTTOM_GAP_PX = 12;
export const CALL_PIP_DEFAULT_BOTTOM_EXTRA_PX = 80;

export type CallPipDimensions = {
  width: number;
  height: number;
};

export type CallPipViewport = {
  width: number;
  height: number;
};

export type CallPipInsets = {
  safeTop: number;
  safeBottom: number;
  marginSide?: number;
  marginBottomExtra?: number;
  marginTopExtra?: number;
};

export type CallPipAnchor = {
  left: number;
  top: number;
};

export type CallPipCornerAnchors = Record<CallPipCorner, CallPipAnchor>;

const CORNER_STORAGE_PREFIX = "cm_call_pip_corner:";

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function computeCallPipDimensions(viewportWidth: number): CallPipDimensions {
  const raw = Math.round(viewportWidth * CALL_PIP_WIDTH_RATIO);
  const width = clamp(raw, CALL_PIP_MIN_WIDTH_PX, CALL_PIP_MAX_WIDTH_PX);
  const height = Math.round((width * 9) / 16);
  return { width, height };
}

export function isCallPipCorner(value: unknown): value is CallPipCorner {
  return typeof value === "string" && (CALL_PIP_CORNERS as readonly string[]).includes(value);
}

export function computeCallPipCornerAnchors(
  viewport: CallPipViewport,
  pipSize: CallPipDimensions,
  insets: CallPipInsets
): CallPipCornerAnchors {
  const marginSide = insets.marginSide ?? CALL_PIP_MARGIN_SIDE_PX;
  const marginBottomExtra = insets.marginBottomExtra ?? CALL_PIP_DEFAULT_BOTTOM_EXTRA_PX;
  const marginTopExtra = insets.marginTopExtra ?? 0;
  const bottomOffset =
    insets.safeBottom + marginBottomExtra + CALL_PIP_MARGIN_BOTTOM_GAP_PX;
  const topOffset = insets.safeTop + marginTopExtra + CALL_PIP_MARGIN_BOTTOM_GAP_PX;

  const maxLeft = Math.max(marginSide, viewport.width - pipSize.width - marginSide);
  const maxTop = Math.max(topOffset, viewport.height - pipSize.height - bottomOffset);

  return {
    topLeft: { left: marginSide, top: topOffset },
    topRight: { left: maxLeft, top: topOffset },
    bottomLeft: { left: marginSide, top: maxTop },
    bottomRight: { left: maxLeft, top: maxTop },
  };
}

export function snapCallPipToNearestCorner(
  pointerCenter: { x: number; y: number },
  anchors: CallPipCornerAnchors
): { corner: CallPipCorner; anchor: CallPipAnchor } {
  let bestCorner: CallPipCorner = CALL_PIP_DEFAULT_CORNER;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const corner of CALL_PIP_CORNERS) {
    const anchor = anchors[corner];
    const cx = anchor.left;
    const cy = anchor.top;
    const dist = Math.hypot(pointerCenter.x - cx, pointerCenter.y - cy);
    if (dist < bestDist) {
      bestDist = dist;
      bestCorner = corner;
    }
  }

  return { corner: bestCorner, anchor: anchors[bestCorner] };
}

export function callPipCornerStorageKey(sessionId: string): string {
  return `${CORNER_STORAGE_PREFIX}${sessionId.trim()}`;
}

export function readCallPipCornerStorage(sessionId: string): CallPipCorner | null {
  if (typeof sessionStorage === "undefined") return null;
  const sid = sessionId.trim();
  if (!sid) return null;
  try {
    const raw = sessionStorage.getItem(callPipCornerStorageKey(sid));
    return isCallPipCorner(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeCallPipCornerStorage(sessionId: string, corner: CallPipCorner): void {
  if (typeof sessionStorage === "undefined") return;
  const sid = sessionId.trim();
  if (!sid) return;
  try {
    sessionStorage.setItem(callPipCornerStorageKey(sid), corner);
  } catch {
    /* ignore */
  }
}

export function clearCallPipCornerStorage(sessionId?: string | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (sessionId?.trim()) {
      sessionStorage.removeItem(callPipCornerStorageKey(sessionId));
      return;
    }
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(CORNER_STORAGE_PREFIX)) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** legacy `cm_call_pip_pos:*` 제거 */
export function clearLegacyCallPipPositionStorage(sessionId?: string | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (sessionId?.trim()) {
      sessionStorage.removeItem(`cm_call_pip_pos:${sessionId.trim()}`);
      return;
    }
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith("cm_call_pip_pos:")) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export type CallVideoPipPositionMode = "stage-absolute" | "viewport-fixed";

export function readCallViewportInsetsFromDom(): CallPipInsets {
  if (typeof document === "undefined") {
    return {
      safeTop: 0,
      safeBottom: 0,
      marginBottomExtra: CALL_PIP_DEFAULT_BOTTOM_EXTRA_PX,
    };
  }

  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const safeBottom = parseFloat(styles.getPropertyValue("--chat-safe-bottom") || "0") || 0;
  const safeTop = parseFloat(styles.getPropertyValue("--call-safe-bottom") || "0") || 0;
  const composerH = parseFloat(styles.getPropertyValue("--chat-composer-height") || "0") || 0;
  const bottomNavH = 56;

  let measuredSafeBottom = safeBottom;
  if (measuredSafeBottom <= 0) {
    const el = document.createElement("div");
    el.style.cssText =
      "position:absolute;left:-9999px;bottom:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px);";
    document.body.appendChild(el);
    measuredSafeBottom = parseFloat(getComputedStyle(el).paddingBottom || "0") || 0;
    document.body.removeChild(el);
  }

  const marginBottomExtra = Math.max(composerH, bottomNavH, CALL_PIP_DEFAULT_BOTTOM_EXTRA_PX);

  return {
    safeTop: 0,
    safeBottom: measuredSafeBottom,
    marginBottomExtra,
  };
}
