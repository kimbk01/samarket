import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BROWSE_SUBTOPIC_COLLAPSE_HIDE_AFTER_PX,
  BROWSE_SUBTOPIC_COLLAPSE_REVEAL_BEFORE_PX,
  resolveBrowseSubtopicCollapsedFromScroll,
  resolveBrowseSubtopicSentinelRelativeTop,
} from "@/lib/stores/browse-subtopic-collapse-chrome";

describe("browse-subtopic-collapse-chrome", () => {
  it("keeps expanded at scroll top when sentinel is at content origin", () => {
    expect(resolveBrowseSubtopicCollapsedFromScroll(false, 0, 0)).toBe(false);
  });

  it("collapses when scroll passes sentinel with hide margin", () => {
    const relativeTop = 12;
    expect(
      resolveBrowseSubtopicCollapsedFromScroll(
        false,
        relativeTop + BROWSE_SUBTOPIC_COLLAPSE_HIDE_AFTER_PX + 1,
        relativeTop
      )
    ).toBe(true);
  });

  it("holds collapsed until scroll returns within reveal band (hysteresis)", () => {
    const relativeTop = 40;
    const hideAt = relativeTop + BROWSE_SUBTOPIC_COLLAPSE_HIDE_AFTER_PX + 5;
    expect(resolveBrowseSubtopicCollapsedFromScroll(false, hideAt, relativeTop)).toBe(true);
    const stillCollapsed = relativeTop + BROWSE_SUBTOPIC_COLLAPSE_REVEAL_BEFORE_PX + 1;
    expect(resolveBrowseSubtopicCollapsedFromScroll(true, stillCollapsed, relativeTop)).toBe(true);
    const revealAt = relativeTop + BROWSE_SUBTOPIC_COLLAPSE_REVEAL_BEFORE_PX;
    expect(resolveBrowseSubtopicCollapsedFromScroll(true, revealAt, relativeTop)).toBe(false);
  });

  it("reveals at scroll top when sentinel is at content origin", () => {
    expect(resolveBrowseSubtopicCollapsedFromScroll(true, 0, 0)).toBe(false);
    expect(resolveBrowseSubtopicCollapsedFromScroll(true, 5, 0)).toBe(false);
    expect(resolveBrowseSubtopicCollapsedFromScroll(true, 8, 0)).toBe(false);
    expect(resolveBrowseSubtopicCollapsedFromScroll(true, 9, 0)).toBe(true);
  });

  it("computes sentinel relative top invariant to shared viewport shift", () => {
    const before = resolveBrowseSubtopicSentinelRelativeTop(
      { top: 200 },
      { top: 212 },
      16
    );
    const afterHeaderShrink = resolveBrowseSubtopicSentinelRelativeTop(
      { top: 112 },
      { top: 124 },
      16
    );
    expect(afterHeaderShrink).toBe(before);
  });

  it("uses IO module without scroll delta chrome or per-scroll cache bust", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/stores/browse-subtopic-collapse-chrome.ts"),
      "utf8"
    );
    expect(src).toContain("IntersectionObserver");
    expect(src).toContain("getStoreDetailAppScrollRootCached");
    expect(src).toContain("subscribeAppShellScroll");
    expect(src).toContain("resolveBrowseSubtopicCollapsedFromScroll");
    expect(src).not.toContain("resolveBottomNavScrollChromeAction");
    expect(src).not.toContain("getMainAppScrollTop");
    const syncStart = src.indexOf("function syncCollapsedFromGeometry");
    const syncEnd = src.indexOf("function teardownObserver");
    const syncBody = src.slice(syncStart, syncEnd);
    expect(syncBody).not.toContain("invalidateStoreDetailScrollRootCache");
  });

  it("removed delta scroll-hide hook file", () => {
    expect(
      existsSync(join(process.cwd(), "lib/stores/use-stores-browse-header-scroll-hide.ts"))
    ).toBe(false);
  });
});
