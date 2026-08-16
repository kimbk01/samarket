/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(__dirname, "../HorizontalDragScroll.tsx"),
  "utf8"
);

describe("HorizontalDragScroll click vs drag contract", () => {
  it("does not call setPointerCapture inside onPointerDown", () => {
    const downBlock = src.slice(src.indexOf("const onPointerDown"), src.indexOf("const onPointerMove"));
    expect(downBlock).toMatch(/DO NOT setPointerCapture on pointerdown/);
    expect(downBlock).not.toMatch(/el\.setPointerCapture\(/);
    expect(src).toContain("captureHeld");
    expect(src).toMatch(/el\.setPointerCapture\(/);
  });

  it("CommunityFeed topic strip enables allowDragFromInteractive", () => {
    const feed = readFileSync(join(__dirname, "../CommunityFeed.tsx"), "utf8");
    expect(feed).toContain("allowDragFromInteractive");
    expect(feed).toContain("applyNavSelection");
  });
});
