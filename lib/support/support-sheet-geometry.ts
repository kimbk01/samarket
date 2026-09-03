/**
 * Support modal sheet geometry — ONE owner math for HANDOFF + ACTIVE.
 *
 * Cap / iOS WKWebView: `position:fixed` is visual-viewport relative.
 * Applying `visualViewport.offsetTop` as stage `top` double-counts native
 * focus pan (PHASE 3-B C5: offsetTop=179 → headerRelTop=-49).
 *
 * Authority: visual-viewport height band once, stage top always 0.
 * Never both `top = offsetTop` and native pan.
 */

export const SUPPORT_SHEET_HEIGHT_RATIO = 0.8;

export type SupportSheetGeometryInput = {
  visualViewportHeight: number;
  /** Recorded for contracts / diagnostics — must NOT move stage top. */
  visualViewportOffsetTop: number;
  layoutHeight: number;
  heightRatio?: number;
};

export type SupportSheetGeometry = {
  /** Always 0 — do not apply offsetTop to stage top. */
  stageTopPx: number;
  stageHeightPx: number;
  sheetHeightPx: number;
  /** Explicit: offsetTop must not drive stageTop. */
  appliesOffsetTopToStage: false;
  /** True when keyboard band is known (vv height > 0). */
  bandKnown: boolean;
};

/**
 * Resolve Support overlay stage + panel heights.
 * Keyboard open shrinks `stageHeight`/`sheetHeight` via vv.height only.
 */
export function resolveSupportSheetGeometry(
  input: SupportSheetGeometryInput
): SupportSheetGeometry {
  const ratio =
    typeof input.heightRatio === "number" && Number.isFinite(input.heightRatio)
      ? Math.min(1, Math.max(0.1, input.heightRatio))
      : SUPPORT_SHEET_HEIGHT_RATIO;
  const vvH = Math.max(0, Math.round(input.visualViewportHeight));
  const bandKnown = vvH > 0;
  if (!bandKnown) {
    return {
      stageTopPx: 0,
      stageHeightPx: 0,
      sheetHeightPx: 0,
      appliesOffsetTopToStage: false,
      bandKnown: false,
    };
  }
  // Ignore offsetTop for stage placement (double-count guard).
  void input.visualViewportOffsetTop;
  void input.layoutHeight;
  const stageHeightPx = vvH;
  const sheetHeightPx = Math.max(1, Math.min(Math.round(stageHeightPx * ratio), stageHeightPx));
  return {
    stageTopPx: 0,
    stageHeightPx,
    sheetHeightPx,
    appliesOffsetTopToStage: false,
    bandKnown: true,
  };
}
