import { describe, expect, it } from "vitest";
import { clampFrame, moveFrame, projectFrame, resizeFrameAspect } from "../geometry";

describe("intro-engine geometry", () => {
  it("projects normalized frames to percent", () => {
    expect(projectFrame({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toEqual({
      left: "10%",
      top: "20%",
      width: "30%",
      height: "40%",
    });
  });

  it("clamps drag inside the full viewport", () => {
    const moved = moveFrame({ x: 0.8, y: 0.8, width: 0.3, height: 0.3 }, 0.5, 0.5);
    expect(moved.x + moved.width).toBeLessThanOrEqual(1);
    expect(moved.y + moved.height).toBeLessThanOrEqual(1);
  });

  it("preserves aspect on corner resize", () => {
    const start = { x: 0.2, y: 0.2, width: 0.4, height: 0.2 };
    const next = resizeFrameAspect(start, "se", { x: 0.8, y: 0.9 });
    expect(next.width / next.height).toBeCloseTo(start.width / start.height, 5);
    const clamped = clampFrame({ x: -0.2, y: -0.2, width: 1.4, height: 1.4 });
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0);
    expect(clamped.width).toBeLessThanOrEqual(1);
  });
});
