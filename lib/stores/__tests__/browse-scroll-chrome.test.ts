import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ui/store-detail-scroll-root", () => ({
  isMainAppScrollBodyOverflowing: vi.fn(),
  getStoreDetailScrollTop: vi.fn(() => 0),
}));

import { isMainAppScrollBodyOverflowing } from "@/lib/ui/store-detail-scroll-root";
import {
  applyBrowseScrollChromeForTests,
  getBrowseScrollChromeHiddenSnapshot,
  resetBrowseScrollChromeStateForTests,
} from "@/lib/stores/browse-scroll-chrome";

const overflowMock = vi.mocked(isMainAppScrollBodyOverflowing);

describe("browse-scroll-chrome", () => {
  beforeEach(() => {
    resetBrowseScrollChromeStateForTests();
    overflowMock.mockReset();
  });

  afterEach(() => {
    resetBrowseScrollChromeStateForTests();
  });

  it("keeps hidden false when main body does not overflow", () => {
    overflowMock.mockReturnValue(false);
    applyBrowseScrollChromeForTests(0);
    applyBrowseScrollChromeForTests(80);
    expect(getBrowseScrollChromeHiddenSnapshot()).toBe(false);
  });

  it("hides on scroll down and reveals at top when overflowing", () => {
    overflowMock.mockReturnValue(true);
    applyBrowseScrollChromeForTests(0);
    applyBrowseScrollChromeForTests(20);
    expect(getBrowseScrollChromeHiddenSnapshot()).toBe(true);
    applyBrowseScrollChromeForTests(10);
    expect(getBrowseScrollChromeHiddenSnapshot()).toBe(false);
  });

  it("holds hidden state on small scroll deltas while hidden", () => {
    overflowMock.mockReturnValue(true);
    applyBrowseScrollChromeForTests(0);
    applyBrowseScrollChromeForTests(20);
    expect(getBrowseScrollChromeHiddenSnapshot()).toBe(true);
    applyBrowseScrollChromeForTests(22);
    expect(getBrowseScrollChromeHiddenSnapshot()).toBe(true);
    applyBrowseScrollChromeForTests(24);
    expect(getBrowseScrollChromeHiddenSnapshot()).toBe(true);
  });

  it("reads scroll Y from main app root only (no event.target reader)", () => {
    const src = readFileSync(join(process.cwd(), "lib/stores/browse-scroll-chrome.ts"), "utf8");
    expect(src).toContain("getMainAppScrollTop()");
    expect(src).not.toContain("readScrollTopFromScrollTarget");
  });
});
