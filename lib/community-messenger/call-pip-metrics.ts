/** PiP 4모서리 앵커 — 카카오톡/텔레그램/바이버식 세로 self view (3:4 ~ 1.38) */
export type CallPipCorner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export const CALL_PIP_CORNERS: readonly CallPipCorner[] = [
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
] as const;

export const CALL_PIP_DEFAULT_CORNER: CallPipCorner = "bottomRight";

/** CSS aspect-ratio 3/4 — height = width × CALL_PIP_PORTRAIT_HEIGHT_RATIO (1.38) */
export const CALL_PIP_ASPECT_RATIO_WIDTH = 3;
export const CALL_PIP_ASPECT_RATIO_HEIGHT = 4;

/** iPhone / Android — clamp(108px, 29vw, 128px) */
export const CALL_PIP_MOBILE_MIN_WIDTH_PX = 108;
export const CALL_PIP_MOBILE_MAX_WIDTH_PX = 128;
export const CALL_PIP_MOBILE_VW_RATIO = 0.29;

/** 큰 모바일 / 폴더블 (480–767) — clamp(120px, 25vw, 145px) */
export const CALL_PIP_LARGE_MOBILE_BREAKPOINT_PX = 480;
export const CALL_PIP_LARGE_MOBILE_MIN_WIDTH_PX = 120;
export const CALL_PIP_LARGE_MOBILE_MAX_WIDTH_PX = 145;
export const CALL_PIP_LARGE_MOBILE_VW_RATIO = 0.25;

/** 태블릿 (768–1023) — clamp(135px, 18vw, 175px) */
export const CALL_PIP_TABLET_BREAKPOINT_PX = 768;
export const CALL_PIP_TABLET_MIN_WIDTH_PX = 135;
export const CALL_PIP_TABLET_MAX_WIDTH_PX = 175;
export const CALL_PIP_TABLET_VW_RATIO = 0.18;

/** PC (>=1024) — clamp(145px, 11vw, 190px) */
export const CALL_PIP_PC_BREAKPOINT_PX = 1024;
export const CALL_PIP_PC_MIN_WIDTH_PX = 145;
export const CALL_PIP_PC_MAX_WIDTH_PX = 190;
export const CALL_PIP_PC_VW_RATIO = 0.11;

/** 더블탭 확대 — 모바일 clamp(145px, 38vw, 180px) */
export const CALL_PIP_EXPANDED_MOBILE_MIN_WIDTH_PX = 145;
export const CALL_PIP_EXPANDED_MOBILE_VW_RATIO = 0.38;
export const CALL_PIP_EXPANDED_MOBILE_MAX_WIDTH_PX = 180;

/** 더블탭 확대 — 태블릿 clamp(165px, 24vw, 230px) */
export const CALL_PIP_EXPANDED_TABLET_MIN_WIDTH_PX = 165;
export const CALL_PIP_EXPANDED_TABLET_VW_RATIO = 0.24;
export const CALL_PIP_EXPANDED_TABLET_MAX_WIDTH_PX = 230;

/** 더블탭 확대 — PC clamp(180px, 14vw, 260px) */
export const CALL_PIP_EXPANDED_PC_MIN_WIDTH_PX = 180;
export const CALL_PIP_EXPANDED_PC_VW_RATIO = 0.14;
export const CALL_PIP_EXPANDED_PC_MAX_WIDTH_PX = 260;

export const CALL_PIP_MARGIN_SIDE_PX = 16;
/** safe-area-bottom + call controls + gap */
export const CALL_PIP_MARGIN_BOTTOM_GAP_PX = 18;
export const CALL_PIP_DEFAULT_BOTTOM_EXTRA_PX = 80;
export const CALL_PIP_ACTION_BAR_HEIGHT_CSS_VAR = "--call-pip-action-bar-height";

export const CALL_PIP_SNAP_STORAGE_KEY = "dibay:call:self-view-pip-snap";
/** @deprecated migrate → CALL_PIP_SNAP_STORAGE_KEY */
export const CALL_PIP_SNAP_STORAGE_KEY_LEGACY = "dibay:video-call:self-view-pip-snap";
/** @deprecated migrate → CALL_PIP_SNAP_STORAGE_KEY */
export const CALL_PIP_SNAP_STORAGE_KEY_LEGACY_SNAP = "dibay:video-call:self-view-snap-position";

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

/** 세로 self view — width × 1.38 (3:4 근사, 9:16보다 짧은 카드) */
export const CALL_PIP_PORTRAIT_HEIGHT_RATIO = 1.38;

function pipPortraitHeightFromWidth(width: number): number {
  return Math.round(width * CALL_PIP_PORTRAIT_HEIGHT_RATIO);
}

function clampVwWidth(viewportWidth: number, vwRatio: number, minPx: number, maxPx: number): number {
  const raw = Math.round(viewportWidth * vwRatio);
  return clamp(raw, minPx, maxPx);
}

/** 기본 Self View PiP 크기 — 모바일/태블릿/PC 분기 */
export function computeCallPipDimensions(viewportWidth: number, expanded = false): CallPipDimensions {
  if (expanded) {
    return computeCallPipExpandedDimensions(viewportWidth);
  }

  const width = computeCallPipBaseWidth(viewportWidth);
  return { width, height: pipPortraitHeightFromWidth(width) };
}

function computeCallPipBaseWidth(viewportWidth: number): number {
  if (viewportWidth >= CALL_PIP_PC_BREAKPOINT_PX) {
    return clampVwWidth(
      viewportWidth,
      CALL_PIP_PC_VW_RATIO,
      CALL_PIP_PC_MIN_WIDTH_PX,
      CALL_PIP_PC_MAX_WIDTH_PX
    );
  }
  if (viewportWidth >= CALL_PIP_TABLET_BREAKPOINT_PX) {
    return clampVwWidth(
      viewportWidth,
      CALL_PIP_TABLET_VW_RATIO,
      CALL_PIP_TABLET_MIN_WIDTH_PX,
      CALL_PIP_TABLET_MAX_WIDTH_PX
    );
  }
  if (viewportWidth >= CALL_PIP_LARGE_MOBILE_BREAKPOINT_PX) {
    const largeWidth = clampVwWidth(
      viewportWidth,
      CALL_PIP_LARGE_MOBILE_VW_RATIO,
      CALL_PIP_LARGE_MOBILE_MIN_WIDTH_PX,
      CALL_PIP_LARGE_MOBILE_MAX_WIDTH_PX
    );
    const mobileWidth = clampVwWidth(
      viewportWidth,
      CALL_PIP_MOBILE_VW_RATIO,
      CALL_PIP_MOBILE_MIN_WIDTH_PX,
      CALL_PIP_MOBILE_MAX_WIDTH_PX
    );
    /** 480px 경계에서 PiP가 갑자기 작아지지 않도록 — 큰 모바일은 일반 모바일보다 작으면 사용하지 않음 */
    return Math.max(largeWidth, mobileWidth);
  }
  return clampVwWidth(
    viewportWidth,
    CALL_PIP_MOBILE_VW_RATIO,
    CALL_PIP_MOBILE_MIN_WIDTH_PX,
    CALL_PIP_MOBILE_MAX_WIDTH_PX
  );
}

/** 더블탭 확대 PiP — 세로 1.38 유지 */
export function computeCallPipExpandedDimensions(viewportWidth: number): CallPipDimensions {
  let width: number;
  if (viewportWidth >= CALL_PIP_PC_BREAKPOINT_PX) {
    width = clampVwWidth(
      viewportWidth,
      CALL_PIP_EXPANDED_PC_VW_RATIO,
      CALL_PIP_EXPANDED_PC_MIN_WIDTH_PX,
      CALL_PIP_EXPANDED_PC_MAX_WIDTH_PX
    );
  } else if (viewportWidth >= CALL_PIP_TABLET_BREAKPOINT_PX) {
    width = clampVwWidth(
      viewportWidth,
      CALL_PIP_EXPANDED_TABLET_VW_RATIO,
      CALL_PIP_EXPANDED_TABLET_MIN_WIDTH_PX,
      CALL_PIP_EXPANDED_TABLET_MAX_WIDTH_PX
    );
  } else {
    width = clampVwWidth(
      viewportWidth,
      CALL_PIP_EXPANDED_MOBILE_VW_RATIO,
      CALL_PIP_EXPANDED_MOBILE_MIN_WIDTH_PX,
      CALL_PIP_EXPANDED_MOBILE_MAX_WIDTH_PX
    );
  }
  return { width, height: pipPortraitHeightFromWidth(width) };
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

  for (const corner of CALL_PIP_CORNERS) {
    const anchor = anchors[corner];
    const cx = anchor.left + pipSize.width / 2;
    const cy = anchor.top + pipSize.height / 2;
    const dist = Math.hypot(pointerCenter.x - cx, pointerCenter.y - cy);
    if (dist < bestDist) {
      bestDist = dist;
      bestCorner = corner;
    }
  }

  return { corner: bestCorner, anchor: anchors[bestCorner] };
}

/** 드래그 종료 시 transform 리셋 전 — 스냅 판정용 PiP 중심 좌표 */
export function resolveCallPipDragSnapCenter(args: {
  originLeft: number;
  originTop: number;
  dx: number;
  dy: number;
  pipSize: CallPipDimensions;
}): { x: number; y: number } {
  return {
    x: args.originLeft + args.dx + args.pipSize.width / 2,
    y: args.originTop + args.dy + args.pipSize.height / 2,
  };
}

function readLegacyCallPipSnapRaw(): string | null {
  if (typeof localStorage === "undefined") return null;
  return (
    localStorage.getItem(CALL_PIP_SNAP_STORAGE_KEY_LEGACY) ??
    localStorage.getItem(CALL_PIP_SNAP_STORAGE_KEY_LEGACY_SNAP)
  );
}

export function readCallPipSnapPosition(): CallPipCorner | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CALL_PIP_SNAP_STORAGE_KEY) ?? readLegacyCallPipSnapRaw();
    if (!raw) return null;
    const corner = fromSnapStorageValue(raw);
    if (corner && !localStorage.getItem(CALL_PIP_SNAP_STORAGE_KEY)) {
      writeCallPipSnapPosition(corner);
    }
    return corner;
  } catch {
    return null;
  }
}

export function writeCallPipSnapPosition(corner: CallPipCorner): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CALL_PIP_SNAP_STORAGE_KEY, toSnapStorageValue(corner));
    localStorage.removeItem(CALL_PIP_SNAP_STORAGE_KEY_LEGACY);
    localStorage.removeItem(CALL_PIP_SNAP_STORAGE_KEY_LEGACY_SNAP);
  } catch {
    /* ignore */
  }
}

/** sessionStorage legacy → localStorage 1회 마이그레이션 */
export function migrateLegacyCallPipSnapStorage(): void {
  if (typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;
  try {
    if (!localStorage.getItem(CALL_PIP_SNAP_STORAGE_KEY)) {
      const legacyRaw = readLegacyCallPipSnapRaw();
      const legacyCorner = legacyRaw ? fromSnapStorageValue(legacyRaw) : null;
      if (legacyCorner) {
        writeCallPipSnapPosition(legacyCorner);
      }
    }

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

let cachedSafeAreaInsets: { safeTop: number; safeBottom: number } | null = null;

/** orientationchange·resize 시 safe-area 캐시 무효화 */
export function invalidateCallPipSafeAreaCache(): void {
  cachedSafeAreaInsets = null;
}

function readActionBarHeightFromElement(el: HTMLElement | null): number {
  if (!el || typeof getComputedStyle === "undefined") return 0;
  const parsed =
    parseFloat(getComputedStyle(el).getPropertyValue(CALL_PIP_ACTION_BAR_HEIGHT_CSS_VAR) || "0") || 0;
  return parsed > 0 ? parsed : 0;
}

/** iOS safe-area — stage·viewport 공통 (프레임당 1회 DOM probe) */
export function readCallPipSafeAreaInsetsFromDom(): { safeTop: number; safeBottom: number } {
  if (cachedSafeAreaInsets) return cachedSafeAreaInsets;

  if (typeof document === "undefined") {
    return { safeTop: 0, safeBottom: 0 };
  }

  const root = document.documentElement;
  const styles = getComputedStyle(root);
  let safeBottom = parseFloat(styles.getPropertyValue("--chat-safe-bottom") || "0") || 0;
  let safeTop = parseFloat(styles.getPropertyValue("--chat-safe-top") || "0") || 0;

  if (safeBottom <= 0 || safeTop <= 0) {
    const el = document.createElement("div");
    el.style.cssText =
      "position:absolute;left:-9999px;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);";
    document.body.appendChild(el);
    const computed = getComputedStyle(el);
    if (safeTop <= 0) {
      safeTop = parseFloat(computed.paddingTop || "0") || 0;
    }
    if (safeBottom <= 0) {
      safeBottom = parseFloat(computed.paddingBottom || "0") || 0;
    }
    document.body.removeChild(el);
  }

  cachedSafeAreaInsets = { safeTop, safeBottom };
  return cachedSafeAreaInsets;
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
  const { safeTop, safeBottom } = readCallPipSafeAreaInsetsFromDom();

  return {
    safeTop,
    safeBottom,
    marginSide: CALL_PIP_MARGIN_SIDE_PX,
    marginBottomExtra: actionBarH > 0 ? actionBarH : CALL_PIP_DEFAULT_BOTTOM_EXTRA_PX,
  };
}

export function readCallViewportInsetsFromDom(): CallPipInsets {
  if (typeof document === "undefined") {
    return {
      safeTop: 0,
      safeBottom: 0,
      marginSide: CALL_PIP_MARGIN_SIDE_PX,
      marginBottomExtra: CALL_PIP_DEFAULT_BOTTOM_EXTRA_PX,
    };
  }

  const composerH =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--chat-composer-height") || "0") || 0;
  const bottomNavH = 56;
  const actionBarH = readActionBarHeightFromElement(document.documentElement);
  const { safeTop, safeBottom } = readCallPipSafeAreaInsetsFromDom();

  const marginBottomExtra = Math.max(
    actionBarH,
    composerH,
    bottomNavH,
    CALL_PIP_DEFAULT_BOTTOM_EXTRA_PX
  );

  return {
    safeTop,
    safeBottom,
    marginSide: CALL_PIP_MARGIN_SIDE_PX,
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
