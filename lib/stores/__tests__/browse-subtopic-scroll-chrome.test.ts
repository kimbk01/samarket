import { describe, expect, it } from "vitest";
import { applyBrowseSubtopicScrollStepForTests } from "@/lib/stores/use-stores-browse-header-scroll-hide";

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
});
