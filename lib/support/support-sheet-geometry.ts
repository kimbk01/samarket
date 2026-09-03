/**
 * Support modal sheet geometry — ONE owner for HANDOFF + ACTIVE (iPhone / iPad / Cap / Android).
 *
 * Contract:
 * - Header stays at top of the sheet (shrink-0), never scrolled away.
 * - Timeline (flex-1) keeps usable height so latest messages stay visible above composer.
 * - Composer docks at sheet bottom, immediately above the keyboard.
 * - Layout-anchored overlay (CSS fixed inset-0). Never set stage `top = offsetTop`
 *   (Cap/iOS can already pin `fixed` to the visual viewport → double-count / flicker).
 * - Keyboard reduces usable height once — never height shrink + paddingBottom together.
 *
 * Open keyboard → fill the visible band that intersects the layout viewport:
 *   sheetHeight = min(vvH, layoutH - offsetTop) when offsetTop < layoutH
 *   sheetLift   = max(0, layoutH - (offsetTop + vvH))  // marginBottom
 * Closed → full usable height, paddingBottom = safeBottom only.
 */

export const SUPPORT_SHEET_HEIGHT_RATIO = 1;

export type SupportSheetGeometryInput = {
  visualViewportHeight: number;
  /**
   * Layout Y of visualViewport top. Used only to size/lift the sheet into the
   * visible band — never applied as stage `top`.
   */
  visualViewportOffsetTop: number;
  layoutHeight: number;
  keyboardOpen: boolean;
  /** Diagnostics / Form SSOT — open path derives lift from VV frame, not this alone. */
  keyboardOcclusionInset: number;
  safeBottom: number;
  heightRatio?: number;
};

export type SupportSheetGeometry = {
  stageTopPx: number;
  applyStageBand: false;
  appliesOffsetTopToStage: false;
  bandKnown: boolean;
  /** Panel border-box height. */
  sheetHeightPx: number;
  /**
   * Lift sheet above OSK / align bottom to visual bottom
   * (marginBottom — NOT paddingBottom, so timeline keeps full inner height).
   */
  sheetLiftPx: number;
  /** Inner safe padding when keyboard closed only. */
  paddingBottomPx: number;
};

/**
 * Resolve Support panel box for all Cap/Web keyboard models with one formula.
 */
export function resolveSupportSheetGeometry(
  input: SupportSheetGeometryInput
): SupportSheetGeometry {
  const ratio =
    typeof input.heightRatio === "number" && Number.isFinite(input.heightRatio)
      ? Math.min(1, Math.max(0.1, input.heightRatio))
      : SUPPORT_SHEET_HEIGHT_RATIO;
  const vvH = Math.max(0, Math.round(input.visualViewportHeight));
  const layoutH = Math.max(0, Math.round(input.layoutHeight));
  const offsetTop = Math.max(0, Math.round(input.visualViewportOffsetTop));
  const safeBottom = Math.max(0, Math.round(input.safeBottom));
  // Occlusion is Form diagnostics; open geometry uses the VV frame intersection.
  void input.keyboardOcclusionInset;

  const bandKnown = vvH > 0 || layoutH > 0;
  if (!bandKnown) {
    return {
      stageTopPx: 0,
      applyStageBand: false,
      appliesOffsetTopToStage: false,
      bandKnown: false,
      sheetHeightPx: 0,
      sheetLiftPx: 0,
      paddingBottomPx: 0,
    };
  }

  if (input.keyboardOpen && vvH > 0) {
    const layoutBase = layoutH > 0 ? layoutH : vvH + offsetTop;
    // Visible band bottom, clamped into the layout viewport.
    const visualBottom = offsetTop + vvH;
    const visualBottomClamped = Math.min(layoutBase, visualBottom);
    // Height of the visible band that still lies inside the layout viewport.
    const bandInsideLayout = Math.max(1, visualBottomClamped - Math.min(offsetTop, layoutBase));
    const sheetHeightPx = Math.max(1, Math.round(bandInsideLayout * ratio));
    // Dock sheet bottom to visual bottom (above OSK). No inner keyboard padding.
    const sheetLiftPx = Math.max(0, layoutBase - visualBottomClamped);

    return {
      stageTopPx: 0,
      applyStageBand: false,
      appliesOffsetTopToStage: false,
      bandKnown: true,
      sheetHeightPx,
      sheetLiftPx,
      paddingBottomPx: 0,
    };
  }

  const closedBase = Math.max(vvH, layoutH);
  return {
    stageTopPx: 0,
    applyStageBand: false,
    appliesOffsetTopToStage: false,
    bandKnown: true,
    sheetHeightPx: Math.max(1, Math.round(closedBase * ratio)),
    sheetLiftPx: 0,
    paddingBottomPx: safeBottom,
  };
}
