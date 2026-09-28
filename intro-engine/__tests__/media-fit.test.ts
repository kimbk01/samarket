import { describe, expect, it } from "vitest";
import { computeFittedRect } from "../media-fit";

describe("intro-engine media-fit", () => {
  it("contain letterboxes a wide image", () => {
    const fitted = computeFittedRect({ width: 100, height: 100 }, { width: 200, height: 100 }, "contain");
    expect(fitted.width).toBe(100);
    expect(fitted.height).toBe(50);
    expect(fitted.x).toBe(0);
    expect(fitted.y).toBe(25);
  });

  it("cover crops a wide image", () => {
    const fitted = computeFittedRect({ width: 100, height: 100 }, { width: 200, height: 100 }, "cover");
    expect(fitted.height).toBe(100);
    expect(fitted.width).toBe(200);
    expect(fitted.x).toBe(-50);
    expect(fitted.y).toBe(0);
  });
});
