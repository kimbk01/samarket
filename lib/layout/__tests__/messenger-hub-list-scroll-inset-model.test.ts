import { describe, expect, it } from "vitest";
import {
  proveMountOnlyInsetHideInvariant,
  simulateOuterClearanceCoupledToHide,
} from "@/lib/layout/messenger-hub-list-scroll-inset-model";
import { MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";

describe("messenger hub list scroll inset model", () => {
  it("inset class is 60px + safe-bottom", () => {
    expect(MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS).toContain("60px");
    expect(MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS).toContain("--safe-bottom");
  });

  it("outer-coupled clearance creates hidden→!overflow feedback on borderline content", () => {
    const sim = simulateOuterClearanceCoupledToHide({
      viewportH: 640,
      contentH: 610,
      clearancePx: 60,
    });
    expect(sim.feedbackLoop).toBe(true);
    expect(sim.steps.at(-1)?.hidden).toBe(false);
  });

  it("mount-only inset keeps heights stable across hide", () => {
    const snap = {
      outerShellClientHeight: 700,
      listScrollClientHeight: 600,
      listScrollScrollHeight: 720,
      listPaddingBottomPx: 60,
      contentHeightPx: 660,
      hidden: false as boolean,
    };
    const proof = proveMountOnlyInsetHideInvariant(snap, { ...snap, hidden: true });
    expect(proof).toEqual({
      outerShellDelta: 0,
      listClientHeightDelta: 0,
      scrollHeightDelta: 0,
      feedbackLoop: false,
      ok: true,
    });
  });
});
