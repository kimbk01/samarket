/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeInAppHref,
  readPreviousInAppHistoryHref,
  runFixedDestinationBack,
} from "@/lib/navigation/fixed-destination-back";

type Entry = { url: string; index: number };

function installNavigation(urls: string[], currentIndex: number) {
  const origin = window.location.origin;
  const entries: Entry[] = urls.map((u, index) => ({ url: origin + u, index }));
  Object.defineProperty(window, "navigation", {
    configurable: true,
    value: { currentEntry: entries[currentIndex], entries: () => entries },
  });
}

function router() {
  return { back: vi.fn(), replace: vi.fn() };
}

afterEach(() => {
  Reflect.deleteProperty(window, "navigation");
});

describe("runFixedDestinationBack — no loop, no duplicate", () => {
  it("list → detail → header back: pops (no duplicate list entry)", () => {
    installNavigation(["/market?category=a", "/post/1"], 1);
    const r = router();
    expect(runFixedDestinationBack(r, "/market?category=a")).toBe("back");
    expect(r.back).toHaveBeenCalledTimes(1);
    expect(r.replace).not.toHaveBeenCalled();
  });

  it("search → detail → header back to list: replaces detail (no detail→list→detail loop)", () => {
    installNavigation(["/search?q=x", "/post/1"], 1);
    const r = router();
    expect(runFixedDestinationBack(r, "/market?category=a")).toBe("replace");
    expect(r.replace).toHaveBeenCalledWith("/market?category=a", { scroll: false });
    expect(r.back).not.toHaveBeenCalled();
  });

  it("deep link (first entry) → replace target", () => {
    installNavigation(["/post/1"], 0);
    const r = router();
    expect(runFixedDestinationBack(r, "/market")).toBe("replace");
  });

  it("alias equivalence (community hub / and /philife)", () => {
    installNavigation(["/", "/philife/p1"], 1);
    const r = router();
    const same = (a: string, b: string) =>
      ["/", "/philife"].includes(a.split("?")[0]) && ["/", "/philife"].includes(b.split("?")[0]) &&
      (a.split("?")[1] ?? "") === (b.split("?")[1] ?? "");
    expect(runFixedDestinationBack(r, "/philife", { isSameDestination: same })).toBe("back");
  });

  it("no Navigation API: entry record decides, else replace", () => {
    const r1 = router();
    expect(runFixedDestinationBack(r1, "/philife", { assumePreviousIsTarget: () => true })).toBe("back");
    const r2 = router();
    expect(runFixedDestinationBack(r2, "/philife", { assumePreviousIsTarget: () => false })).toBe("replace");
    const r3 = router();
    expect(runFixedDestinationBack(r3, "/philife")).toBe("replace");
  });

  it("query must match exactly (different filter = different list)", () => {
    installNavigation(["/market?category=a", "/post/1"], 1);
    const r = router();
    expect(runFixedDestinationBack(r, "/market?category=b")).toBe("replace");
  });
});

describe("helpers", () => {
  it("normalizes trailing slash, keeps root, drops hash", () => {
    expect(normalizeInAppHref("/market/?a=1#x", "https://h")).toBe("/market?a=1");
    expect(normalizeInAppHref("/", "https://h")).toBe("/");
    expect(normalizeInAppHref("https://other/x", "https://h")).toBeNull();
  });
  it("reads previous entry or null", () => {
    expect(readPreviousInAppHistoryHref()).toBeNull();
    installNavigation(["/a", "/b?x=1"], 1);
    expect(readPreviousInAppHistoryHref()).toBe("/a");
  });
});
