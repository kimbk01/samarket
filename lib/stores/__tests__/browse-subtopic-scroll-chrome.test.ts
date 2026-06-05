import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyBrowseSubtopicScrollChromeForTests,
  getBrowseSubtopicScrollChromeHiddenSnapshot,
  resetBrowseSubtopicScrollChromeStateForTests,
} from "@/lib/stores/browse-subtopic-scroll-chrome";

describe("browse-subtopic-scroll-chrome", () => {
  beforeEach(() => {
    resetBrowseSubtopicScrollChromeStateForTests();
  });

  afterEach(() => {
    resetBrowseSubtopicScrollChromeStateForTests();
  });

  it("hides on scroll down without overflow gate", () => {
    applyBrowseSubtopicScrollChromeForTests(0);
    applyBrowseSubtopicScrollChromeForTests(20);
    expect(getBrowseSubtopicScrollChromeHiddenSnapshot()).toBe(true);
  });

  it("reveals when scrolling back toward top", () => {
    applyBrowseSubtopicScrollChromeForTests(0);
    applyBrowseSubtopicScrollChromeForTests(20);
    expect(getBrowseSubtopicScrollChromeHiddenSnapshot()).toBe(true);
    applyBrowseSubtopicScrollChromeForTests(10);
    expect(getBrowseSubtopicScrollChromeHiddenSnapshot()).toBe(false);
  });

  it("holds hidden state on small scroll deltas while hidden", () => {
    applyBrowseSubtopicScrollChromeForTests(0);
    applyBrowseSubtopicScrollChromeForTests(20);
    expect(getBrowseSubtopicScrollChromeHiddenSnapshot()).toBe(true);
    applyBrowseSubtopicScrollChromeForTests(22);
    expect(getBrowseSubtopicScrollChromeHiddenSnapshot()).toBe(true);
    applyBrowseSubtopicScrollChromeForTests(24);
    expect(getBrowseSubtopicScrollChromeHiddenSnapshot()).toBe(true);
  });
});
