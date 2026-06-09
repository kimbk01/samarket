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
export const CALL_PIP_MAX_WIDTH_PX = 145;
export const CALL_PIP_WIDTH_RATIO = 0.32;
export const CALL_PIP_DESKTOP_BREAKPOINT_PX = 768;
export const CALL_PIP_DESKTOP_DEFAULT_WIDTH_PX = 150;
export const CALL_PIP_DESKTOP_MAX_WIDTH_PX = 180;
export const CALL_PIP_MARGIN_SIDE_PX = 12;
export const CALL_PIP_MARGIN_BOTTOM_GAP_PX = 12;
export const CALL_PIP_DEFAULT_BOTTOM_EXTRA_PX = 80;
export const CALL_PIP_ACTION_BAR_HEIGHT_CSS_VAR = "--call-pip-action-bar-height";

export const CALL_PIP_SNAP_STORAGE_KEY = "dibay:video-call:self-view-snap-position";

export type CallPipSnapStorageValue =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

const CORNER_TO_SNAP_STORAGE: Record<CallPipCorner, CallPipSnapStorageValue> = {
  topLeft: "top-left",
  topRight: "top-right",
  bottomLeft: "bottom-left",
  bottomRight: "bottom-right",
};

const SNAP_STORAGE_TO_CORNER: Record<CallPipSnapStorageValue, CallPipCorner> = {
  "top-left": "topLeft",
  "top-right": "topRight",
  "bottom-left": "bottomLeft",
  "bottom-right": "bottomRight",
};

const LEGACY_CORNER_STORAGE_PREFIX = "cm_call_pip_corner:";
const LEGACY_POS_STORAGE_PREFIX = "cm_call_pip_pos:";

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

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function computeCallPipDimensions(viewportWidth: number): CallPipDimensions {
  let width: number;
  if (viewportWidth >= CALL_PIP_DESKTOP_BREAKPOINT_PX) {
    width = clamp(
      CALL_PIP_DESKTOP_DEFAULT_WIDTH_PX,
      CALL_PIP_DESKTOP_DEFAULT_WIDTH_PX,
      CALL_PIP_DESKTOP_MAX_WIDTH_PX
    );
  } else {
    const raw = Math.round(viewportWidth * CALL_PIP_WIDTH_RATIO);
    width = clamp(raw, CALL_PIP_MIN_WIDTH_PX, CALL_PIP_MAX_WIDTH_PX);
  }
  const height = Math.round((width * 9) / 16);
  return { width, height };
}

export function isCallPipCorner(value: unknown): value is CallPipCorner {
  return typeof value === "string" && (CALL_PIP_CORNERS as readonly string[]).includes(value);
}

export function isCallPipSnapStorageValue(value: unknown): value is CallPipSnapStorageValue {
  return typeof value === "string" && value in SNAP_STORAGE_TO_CORNER;
}

export function toSnapStorageValue(corner: CallPipCorner): CallPipSnapStorageValue {
  return CORNER_TO_SNAP_STORAGE[corner];
}

export function fromSnapStorageValue(raw: string): CallPipCorner | null {
  if (isCallPipSnapStorageValue(raw)) return SNAP_STORAGE_TO_CORNER[raw];
  if (isCallPipCorner(raw)) return raw;
  return null;
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
  anchors: CallPipCornerAnchors,
  pipSize: CallPipDimensions
): { corner: CallPipCorner; anchor: CallPipAnchor } {
  let bestCorner: CallPipCorner = CALL_PIP_DEFAULT_CORNER;
  let bestDist = Number.POSITIVE_INFINITY;
  const halfW = pipSize.width / 2;
  const halfH = pipSize.height / 2;

  for (const corner of CALL_PIP_CORNERS) {
    const anchor = anchors[corner];
    const cx = anchor.left + halfW;
    const cy = anchor.top + halfH;
    const dist = Math.hypot(pointerCenter.x - cx, pointerCenter.y - cy);
    if (dist < bestDist) {
      bestDist = dist;
      bestCorner = corner;
    }
  }

  return { corner: bestCorner, anchor: anchors[bestCorner] };
}

export function readCallPipSnapPosition(): CallPipCorner | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CALL_PIP_SNAP_STORAGE_KEY);
    if (!raw) return null;
    return fromSnapStorageValue(raw);
  } catch {
    return null;
  }
}

export function writeCallPipSnapPosition(corner: CallPipCorner): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CALL_PIP_SNAP_STORAGE_KEY, toSnapStorageValue(corner));
  } catch {
    /* ignore */
  }
}

/** sessionStorage legacy → localStorage 1회 마이그레이션 */
export function migrateLegacyCallPipSnapStorage(): void {
  if (typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;
  try {
    if (!readCallPipSnapPosition()) {
      let migrated: CallPipCorner | null = null;
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const k = sessionStorage.key(i);
        if (!k?.startsWith(LEGACY_CORNER_STORAGE_PREFIX)) continue;
        const raw = sessionStorage.getItem(k);
        const corner = raw ? fromSnapStorageValue(raw) : null;
        if (corner) migrated = corner;
      }
      if (!migrated) {
        for (let i = 0; i < sessionStorage.length; i += 1) {
          const k = sessionStorage.key(i);
          if (!k?.startsWith(LEGACY_POS_STORAGE_PREFIX)) continue;
          const raw = sessionStorage.getItem(k);
          const corner = raw ? fromSnapStorageValue(raw) : null;
          if (corner) migrated = corner;
        }
      }
      if (migrated) writeCallPipSnapPosition(migrated);
    }
    clearLegacyCallPipSessionStorage();
  } catch {
    /* ignore */
  }
}

/** @deprecated sessionStorage per-session — legacy 정리만 */
export function callPipCornerStorageKey(sessionId: string): string {
  return `${LEGACY_CORNER_STORAGE_PREFIX}${sessionId.trim()}`;
}

/** @deprecated use readCallPipSnapPosition */
export function readCallPipCornerStorage(sessionId: string): CallPipCorner | null {
  void sessionId;
  migrateLegacyCallPipSnapStorage();
  return readCallPipSnapPosition();
}

/** @deprecated use writeCallPipSnapPosition */
export function writeCallPipCornerStorage(_sessionId: string, corner: CallPipCorner): void {
  writeCallPipSnapPosition(corner);
}

/** legacy sessionStorage 키만 제거 — global localStorage snap 은 유지 */
export function clearCallPipCornerStorage(_sessionId?: string | null): void {
  clearLegacyCallPipSessionStorage();
}

function clearLegacyCallPipSessionStorage(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(LEGACY_CORNER_STORAGE_PREFIX) || k?.startsWith(LEGACY_POS_STORAGE_PREFIX)) {
        keys.push(k);
      }
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** legacy `cm_call_pip_pos:*` 제거 */
export function clearLegacyCallPipPositionStorage(sessionId?: string | null): void {
  void sessionId;
  clearLegacyCallPipSessionStorage();
}

export type CallVideoPipPositionMode = "stage-absolute" | "viewport-fixed";

function readActionBarHeightFromElement(el: HTMLElement | null): number {
  if (!el || typeof getComputedStyle === "undefined") return 0;
  const parsed =
    parseFloat(getComputedStyle(el).getPropertyValue(CALL_PIP_ACTION_BAR_HEIGHT_CSS_VAR) || "0") || 0;
  return parsed > 0 ? parsed : 0;
}

/** stage·document 루트에 실측 액션바 높이 동기화 (최소화 portal 포함) */
export function syncCallPipActionBarHeightCssVar(heightPx: number): void {
  if (typeof document === "undefined" || heightPx <= 0) return;
  const px = `${Math.ceil(heightPx)}px`;
  document.documentElement.style.setProperty(CALL_PIP_ACTION_BAR_HEIGHT_CSS_VAR, px);
}

export function clearCallPipActionBarHeightCssVar(): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.removeProperty(CALL_PIP_ACTION_BAR_HEIGHT_CSS_VAR);
}

export function readCallPipInsetsFromStage(
  _stageEl: HTMLElement | null,
  positionMode: CallVideoPipPositionMode
): CallPipInsets {
  if (positionMode === "viewport-fixed") {
    return readCallViewportInsetsFromDom();
  }

  const root = typeof document !== "undefined" ? document.documentElement : null;
  const actionBarH = Math.max(readActionBarHeightFromElement(root), readActionBarHeightFromElement(_stageEl));
  return {
    safeTop: 0,
    safeBottom: 0,
    marginBottomExtra: actionBarH > 0 ? actionBarH : CALL_PIP_DEFAULT_BOTTOM_EXTRA_PX,
  };
}

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
  const composerH = parseFloat(styles.getPropertyValue("--chat-composer-height") || "0") || 0;
  const bottomNavH = 56;
  const actionBarH = readActionBarHeightFromElement(root);

  let measuredSafeBottom = safeBottom;
  if (measuredSafeBottom <= 0) {
    const el = document.createElement("div");
    el.style.cssText =
      "position:absolute;left:-9999px;bottom:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px);";
    document.body.appendChild(el);
    measuredSafeBottom = parseFloat(getComputedStyle(el).paddingBottom || "0") || 0;
    document.body.removeChild(el);
  }

  const marginBottomExtra = Math.max(
    actionBarH,
    composerH,
    bottomNavH,
    CALL_PIP_DEFAULT_BOTTOM_EXTRA_PX
  );

  return {
    safeTop: 0,
    safeBottom: measuredSafeBottom,
    marginBottomExtra,
  };
}

export function clampCallPipDragDelta(args: {
  originLeft: number;
  originTop: number;
  dx: number;
  dy: number;
  pipSize: CallPipDimensions;
  viewport: CallPipViewport;
  insets: CallPipInsets;
}): { dx: number; dy: number } {
  const { originLeft, originTop, dx, dy, pipSize, viewport, insets } = args;
  const marginSide = insets.marginSide ?? CALL_PIP_MARGIN_SIDE_PX;
  const marginBottomExtra = insets.marginBottomExtra ?? CALL_PIP_DEFAULT_BOTTOM_EXTRA_PX;
  const marginTopExtra = insets.marginTopExtra ?? 0;
  const bottomOffset =
    insets.safeBottom + marginBottomExtra + CALL_PIP_MARGIN_BOTTOM_GAP_PX;
  const topOffset = insets.safeTop + marginTopExtra + CALL_PIP_MARGIN_BOTTOM_GAP_PX;

  const minLeft = marginSide;
  const maxLeft = Math.max(minLeft, viewport.width - pipSize.width - marginSide);
  const minTop = topOffset;
  const maxTop = Math.max(minTop, viewport.height - pipSize.height - bottomOffset);

  const nextLeft = clamp(originLeft + dx, minLeft, maxLeft);
  const nextTop = clamp(originTop + dy, minTop, maxTop);
  return { dx: nextLeft - originLeft, dy: nextTop - originTop };
}
