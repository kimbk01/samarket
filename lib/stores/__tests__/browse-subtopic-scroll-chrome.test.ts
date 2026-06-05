import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyBrowseSubtopicScrollStepForTests,
  resolveBrowseSubtopicScrollChromeAction,
} from "@/lib/stores/use-stores-browse-header-scroll-hide";

describe("browse-subtopic-scroll-chrome", () => {
  it("hides on scroll down without overflow gate", () => {
    let lastY = 0;
    const step = applyBrowseSubtopicScrollStepForTests(lastY, 20);
    expect(step.action).toBe("hide");
    lastY = step.nextY;
    expect(lastY).toBe(20);
  });

  it("reveals when scrolling back toward top", () => {
    let lastY = 0;
    let step = applyBrowseSubtopicScrollStepForTests(lastY, 20);
    expect(step.action).toBe("hide");
    lastY = step.nextY;
    step = applyBrowseSubtopicScrollStepForTests(lastY, 10);
    expect(step.action).toBe("reveal");
  });

  it("holds hidden state on small scroll deltas while hidden", () => {
    let lastY = 0;
    let step = applyBrowseSubtopicScrollStepForTests(lastY, 20);
    expect(step.action).toBe("hide");
    lastY = step.nextY;
    step = applyBrowseSubtopicScrollStepForTests(lastY, 22);
    expect(step.action).toBe("hold");
    lastY = step.nextY;
    step = applyBrowseSubtopicScrollStepForTests(lastY, 24);
    expect(step.action).toBe("hold");
  });

  it("reveals at top without requiring upward delta", () => {
    const step = applyBrowseSubtopicScrollStepForTests(80, 10);
    expect(step.action).toBe("reveal");
  });

  it("does not spuriously reveal when y stays high after hide", () => {
    expect(resolveBrowseSubtopicScrollChromeAction(20, 22)).toBe("hold");
    expect(resolveBrowseSubtopicScrollChromeAction(22, 24)).toBe("hold");
  });

  it("reads scroll Y from main app root only (no event.target / window.scrollY)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/stores/use-stores-browse-header-scroll-hide.ts"),
      "utf8"
    );
    expect(src).toContain("getMainAppScrollTop()");
    expect(src).not.toContain("readScrollTopFromScrollTarget");
    expect(src).not.toContain("readScrollTopFromScrollTarget(event");
    expect(src).toContain('action === "hold"');
    expect(src).toContain("collapsedRef");
  });
});
