/**
 * Numeric layout model for messenger hub BottomNav clearance.
 * Clearance lives as scrollport padding-bottom; scroll-hide is transform-only.
 */

export type MessengerHubLayoutSnapshot = {
  outerShellClientHeight: number;
  listScrollClientHeight: number;
  listScrollScrollHeight: number;
  listPaddingBottomPx: number;
  contentHeightPx: number;
  hidden: boolean;
};

/** Stable overflow under mount-only inset (padding stays while hidden toggles). */
export function isListOverflowing(snap: Pick<MessengerHubLayoutSnapshot, "listScrollScrollHeight" | "listScrollClientHeight">): boolean {
  return snap.listScrollScrollHeight > snap.listScrollClientHeight + 0.5;
}

/**
 * Good model: hide does not change clearance → clientHeights / outer shell Δ=0;
 * scrollHeight stays content + padding; no hidden→!overflow→!hidden loop.
 */
export function proveMountOnlyInsetHideInvariant(before: MessengerHubLayoutSnapshot, after: MessengerHubLayoutSnapshot): {
  outerShellDelta: number;
  listClientHeightDelta: number;
  scrollHeightDelta: number;
  feedbackLoop: boolean;
  ok: boolean;
} {
  const outerShellDelta = after.outerShellClientHeight - before.outerShellClientHeight;
  const listClientHeightDelta = after.listScrollClientHeight - before.listScrollClientHeight;
  const scrollHeightDelta = after.listScrollScrollHeight - before.listScrollScrollHeight;
  const paddingStable = before.listPaddingBottomPx === after.listPaddingBottomPx;
  const overflowingBefore = isListOverflowing(before);
  const overflowingAfter = isListOverflowing(after);
  /** Classic thrash: hide → client grows → !overflow → force show */
  const feedbackLoop =
    before.hidden === false &&
    after.hidden === true &&
    listClientHeightDelta > 0 &&
    overflowingBefore &&
    !overflowingAfter;
  const ok =
    outerShellDelta === 0 &&
    listClientHeightDelta === 0 &&
    scrollHeightDelta === 0 &&
    paddingStable &&
    !feedbackLoop;
  return { outerShellDelta, listClientHeightDelta, scrollHeightDelta, feedbackLoop, ok };
}

/**
 * Bad model (historical): outer clearance removed on hide → clientHeight grows → unhide.
 * Used only in contract tests to prove the regression class is closed.
 */
export function simulateOuterClearanceCoupledToHide(params: {
  viewportH: number;
  contentH: number;
  clearancePx: number;
}): { steps: Array<{ hidden: boolean; clientH: number; overflowing: boolean }>; feedbackLoop: boolean } {
  const { viewportH, contentH, clearancePx } = params;
  const steps: Array<{ hidden: boolean; clientH: number; overflowing: boolean }> = [];
  let hidden = false;
  // visible: outer pb shrinks content area
  let clientH = viewportH - clearancePx;
  let overflowing = contentH > clientH;
  steps.push({ hidden, clientH, overflowing });
  // user scrolls → hide → clearance removed
  hidden = true;
  clientH = viewportH;
  overflowing = contentH > clientH;
  steps.push({ hidden, clientH, overflowing });
  const feedbackLoop = steps[0]!.overflowing && !steps[1]!.overflowing;
  if (feedbackLoop) {
    // force show (historical scroll-hide guard)
    hidden = false;
    clientH = viewportH - clearancePx;
    overflowing = contentH > clientH;
    steps.push({ hidden, clientH, overflowing });
  }
  return { steps, feedbackLoop };
}
