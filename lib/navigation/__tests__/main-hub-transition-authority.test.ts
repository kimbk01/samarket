/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  beginMainHubTransitionFromIntent,
  clearMainHubTransitionForTests,
  finalizeMainHubTransition,
  isMainHubTransitionGenerationActive,
  markMainHubTransitionFirstFrame,
  peekMainHubTransition,
  settleMainHubTransitionOnPathname,
  shouldArmMainHubIntentTransition,
} from "@/lib/navigation/main-hub-transition-authority";

describe("main-hub-transition-authority", () => {
  afterEach(() => {
    clearMainHubTransitionForTests();
  });

  it("arms only BottomNav hub↔hub with axis", () => {
    expect(
      shouldArmMainHubIntentTransition({
        source: "bottom-nav",
        fromPath: "/market",
        targetPath: "/stores",
        axis: "rtl",
      })
    ).toBe(true);
    expect(
      shouldArmMainHubIntentTransition({
        source: "trade-primary",
        fromPath: "/market",
        targetPath: "/stores",
        axis: "rtl",
      })
    ).toBe(false);
    expect(
      shouldArmMainHubIntentTransition({
        source: "bottom-nav",
        fromPath: "/market",
        targetPath: "/stores",
        axis: "rtl",
        crossGroup: true,
      })
    ).toBe(false);
  });

  it("generation bump makes stale pathname settle ignore older hop", () => {
    const a = beginMainHubTransitionFromIntent({
      intentId: 1,
      axis: "rtl",
      targetPath: "/stores",
    });
    markMainHubTransitionFirstFrame(a.generation);
    const b = beginMainHubTransitionFromIntent({
      intentId: 2,
      axis: "rtl",
      targetPath: "/community-messenger",
    });
    expect(settleMainHubTransitionOnPathname(a.generation, "/stores")).toBe("stale");
    expect(isMainHubTransitionGenerationActive(a.generation)).toBe(false);
    expect(settleMainHubTransitionOnPathname(b.generation, "/community-messenger")).toBe("settled");
    expect(peekMainHubTransition()?.generation).toBe(b.generation);
    finalizeMainHubTransition(b.generation);
    expect(peekMainHubTransition()).toBeNull();
  });
});
