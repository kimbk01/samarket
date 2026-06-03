import { describe, expect, it } from "vitest";
import {
  classifyRubberBandTouchMove,
  resolveRubberBandGestureLock,
  rubberBandStretchFromDy,
  shouldBlockNativeOverscroll,
} from "@/lib/ui/rubber-band-gesture";

describe("rubber-band-gesture", () => {
  describe("classifyRubberBandTouchMove", () => {
    it("classifies clear vertical pull", () => {
      expect(classifyRubberBandTouchMove(2, 20, "none")).toBe("vertical_pull");
    });

    it("classifies clear horizontal swipe", () => {
      expect(classifyRubberBandTouchMove(40, 5, "none")).toBe("horizontal");
    });

    it("returns none for small diagonal movement", () => {
      expect(classifyRubberBandTouchMove(5, 5, "none")).toBe("none");
    });

    it("returns none when horizontal lock is active", () => {
      expect(classifyRubberBandTouchMove(2, 30, "horizontal")).toBe("none");
    });

    it("allows vertical pull when vertical lock is active", () => {
      expect(classifyRubberBandTouchMove(1, 12, "vertical_pull")).toBe("vertical_pull");
    });

    it("does not stretch on upward touch when vertical lock", () => {
      expect(classifyRubberBandTouchMove(0, -10, "vertical_pull")).toBe("none");
    });
  });

  describe("resolveRubberBandGestureLock", () => {
    it("locks horizontal on horizontal classification", () => {
      expect(resolveRubberBandGestureLock("none", "horizontal")).toBe("horizontal");
    });

    it("keeps horizontal lock for remainder of gesture", () => {
      expect(resolveRubberBandGestureLock("horizontal", "vertical_pull")).toBe("horizontal");
    });

    it("locks vertical on vertical pull", () => {
      expect(resolveRubberBandGestureLock("none", "vertical_pull")).toBe("vertical_pull");
    });
  });

  describe("shouldBlockNativeOverscroll", () => {
    it("blocks only on vertical_pull", () => {
      expect(shouldBlockNativeOverscroll("vertical_pull")).toBe(true);
      expect(shouldBlockNativeOverscroll("horizontal")).toBe(false);
      expect(shouldBlockNativeOverscroll("none")).toBe(false);
    });
  });

  describe("rubberBandStretchFromDy", () => {
    it("caps stretch at maxStretchPx", () => {
      expect(rubberBandStretchFromDy(500, 120)).toBe(120);
    });

    it("returns 0 for non-positive dy", () => {
      expect(rubberBandStretchFromDy(0, 120)).toBe(0);
    });
  });
});
