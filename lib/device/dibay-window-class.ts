/**
 * FD2 WindowClass + usable-window measurement.
 *
 * DeviceClass (FD1) is physical identity and is never derived here.
 * WindowClass is current usable space only.
 *
 * Bands are CANDIDATE_NOT_LOCKED. Do not treat 760 / 1230 / 1302 as Device cutoffs.
 *
 * Usable width consumes existing authorities:
 * - visualViewport.width when present, else window.innerWidth
 * - app-shell `--safe-left` / `--safe-right` (never raw env())
 *
 * This is not a second viewport subscription SSOT.
 * `use-app-viewport-size` remains the resize/visualViewport listener for product UI.
 */

export const DIBAY_WINDOW_CLASS_LOCK_STATE = "CANDIDATE_NOT_LOCKED" as const;

export type DibayWindowClass = "COMPACT" | "MEDIUM" | "EXPANDED" | "LARGE";

export type DibayWindowClassLockState = typeof DIBAY_WINDOW_CLASS_LOCK_STATE;

/**
 * Candidate usable-width bands. NOT Device identity. NOT HARD LOCK numbers.
 *
 * 760 ≈ Messenger LIST_MIN 360 + ROOM_MIN 400.
 * 1230 / 1302 are prior-audit candidates; Android tablet CSS width stays NOT_PROVEN
 * until recorded at runtime.
 */
export const DIBAY_WINDOW_CLASS_BANDS = {
  lockState: DIBAY_WINDOW_CLASS_LOCK_STATE,
  compactMaxExclusive: 760,
  mediumMaxInclusive: 1229,
  expandedMaxInclusive: 1301,
} as const;

export type DibayAvailableWidthSource = "visualViewport.width" | "innerWidth";
export type DibayAvailableHeightSource = "visualViewport.height" | "innerHeight";

export type DibayUsableWindowInput = {
  innerWidth: number;
  innerHeight?: number;
  visualViewportWidth?: number | null;
  visualViewportHeight?: number | null;
  safeLeftPx?: number;
  safeRightPx?: number;
};

export type DibayUsableWindowSnapshot = {
  innerWidth: number;
  innerHeight: number;
  visualViewportWidth: number | null;
  visualViewportHeight: number | null;
  safeLeftPx: number;
  safeRightPx: number;
  availableWidth: number;
  availableHeight: number;
  availableWidthSource: DibayAvailableWidthSource;
  availableHeightSource: DibayAvailableHeightSource;
  usableWidth: number;
  usableHeight: number;
};

export function classifyWindowClass(usableWidthPx: number): DibayWindowClass {
  const width = finitePx(usableWidthPx);
  if (width < DIBAY_WINDOW_CLASS_BANDS.compactMaxExclusive) return "COMPACT";
  if (width <= DIBAY_WINDOW_CLASS_BANDS.mediumMaxInclusive) return "MEDIUM";
  if (width <= DIBAY_WINDOW_CLASS_BANDS.expandedMaxInclusive) return "EXPANDED";
  return "LARGE";
}

export function measureUsableWindow(input?: DibayUsableWindowInput): DibayUsableWindowSnapshot {
  const live = input ? null : readLiveViewportMetrics();
  const innerWidth = finitePx(input?.innerWidth ?? live?.innerWidth ?? 0);
  const innerHeight = finitePx(input?.innerHeight ?? live?.innerHeight ?? 0);
  const visualViewportWidth = optionalFinitePx(input?.visualViewportWidth ?? live?.visualViewportWidth);
  const visualViewportHeight = optionalFinitePx(input?.visualViewportHeight ?? live?.visualViewportHeight);
  const safeLeftPx = finitePx(input?.safeLeftPx ?? live?.safeLeftPx ?? 0);
  const safeRightPx = finitePx(input?.safeRightPx ?? live?.safeRightPx ?? 0);

  const hasVisualWidth = visualViewportWidth != null && visualViewportWidth > 0;
  const hasVisualHeight = visualViewportHeight != null && visualViewportHeight > 0;
  const availableWidth = hasVisualWidth ? visualViewportWidth : innerWidth;
  const availableHeight = hasVisualHeight ? visualViewportHeight : innerHeight;

  return {
    innerWidth,
    innerHeight,
    visualViewportWidth,
    visualViewportHeight,
    safeLeftPx,
    safeRightPx,
    availableWidth,
    availableHeight,
    availableWidthSource: hasVisualWidth ? "visualViewport.width" : "innerWidth",
    availableHeightSource: hasVisualHeight ? "visualViewport.height" : "innerHeight",
    usableWidth: Math.max(0, availableWidth - safeLeftPx - safeRightPx),
    usableHeight: Math.max(0, availableHeight),
  };
}

export function readCssSafeInlinePx(side: "left" | "right"): number {
  if (typeof document === "undefined") return 0;
  const property = side === "left" ? "padding-left" : "padding-right";
  const token = side === "left" ? "var(--safe-left)" : "var(--safe-right)";
  const probe = document.createElement("div");
  probe.style.cssText =
    `position:fixed;top:0;left:0;width:0;height:0;${property}:${token};visibility:hidden;pointer-events:none`;
  document.documentElement.appendChild(probe);
  const raw = getComputedStyle(probe)[side === "left" ? "paddingLeft" : "paddingRight"];
  probe.remove();
  return parseCssPx(raw);
}

export function parseCssPx(value: string | null | undefined): number {
  const px = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(px) ? Math.max(0, Math.round(px)) : 0;
}

function readLiveViewportMetrics(): DibayUsableWindowInput & {
  visualViewportWidth: number | null;
  visualViewportHeight: number | null;
  safeLeftPx: number;
  safeRightPx: number;
} {
  if (typeof window === "undefined") {
    return {
      innerWidth: 0,
      innerHeight: 0,
      visualViewportWidth: null,
      visualViewportHeight: null,
      safeLeftPx: 0,
      safeRightPx: 0,
    };
  }
  const vv = window.visualViewport;
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    visualViewportWidth: typeof vv?.width === "number" ? vv.width : null,
    visualViewportHeight: typeof vv?.height === "number" ? vv.height : null,
    safeLeftPx: readCssSafeInlinePx("left"),
    safeRightPx: readCssSafeInlinePx("right"),
  };
}

function finitePx(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function optionalFinitePx(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;
}
