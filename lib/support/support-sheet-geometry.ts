/**
 * Support modal sheet geometry — ONE owner math for HANDOFF + ACTIVE.
 *
 * ROOT (PHASE 3-B C5): Cap/iOS focus pan sets visualViewport.offsetTop while
 * `position:fixed` overlay uses layout inset. Pinning stage to
 * `{ top: offsetTop, height: vv.height }` relocates the whole sheet and can
 * leave a phantom gap above the keyboard (double geometry).
 *
 * Authority A — layout-anchored overlay:
 * - Do NOT override DibayOverlayRoot fixed inset-0 with a VV band.
 * - Shrink sheet height from vv.height (usable band) once.
 * - Lift footer via effectiveBottomInset only.
 * - Never apply offsetTop to stage top.
 */

export const SUPPORT_SHEET_HEIGHT_RATIO = 0.8;

export type SupportSheetGeometryInput = {
  visualViewportHeight: number;
  /** Diagnostics only — must NOT move stage top. */
  visualViewportOffsetTop: number;
  layoutHeight: number;
  heightRatio?: number;
};

export type SupportSheetGeometry = {
  /** Always 0 — offsetTop must not drive stage placement. */
  stageTopPx: number;
  /**
   * When false, SupportSheetShell must leave DibayOverlayRoot at CSS
   * `position:fixed; inset 0` (no VV band stageStyle).
   */
  applyStageBand: false;
  sheetHeightPx: number;
  appliesOffsetTopToStage: false;
  bandKnown: boolean;
};

/**
 * Resolve Support panel height. Overlay stage stays layout-anchored.
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
  // offsetTop / layoutHeight are intentionally unused for stage placement.
  void input.visualViewportOffsetTop;
  void input.layoutHeight;
  if (!bandKnown) {
    return {
      stageTopPx: 0,
      applyStageBand: false,
      sheetHeightPx: 0,
      appliesOffsetTopToStage: false,
      bandKnown: false,
    };
  }
  const sheetHeightPx = Math.max(1, Math.min(Math.round(vvH * ratio), vvH));
  return {
    stageTopPx: 0,
    applyStageBand: false,
    sheetHeightPx,
    appliesOffsetTopToStage: false,
    bandKnown: true,
  };
}
