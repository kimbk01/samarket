import { afterEach, describe, expect, it, vi } from "vitest";

let rootScrollTop = 0;
vi.mock("@/lib/layout/main-app-scroll-root", () => ({
  getMainAppScrollRootCached: () => ({}),
  getMainAppScrollTop: () => rootScrollTop,
  invalidateMainAppScrollRootCache: () => {},
}));
vi.mock("@/lib/layout/subscribe-app-shell-scroll", () => ({
  subscribeAppShellScroll: () => () => {},
}));

class FakeEl {
  constructor(public scrollTop: number) {}
}

describe("isDibayPtrScrollAtTop (PTR D10)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    rootScrollTop = 0;
  });

  async function setup(listScrollTops: number[]) {
    vi.stubGlobal("HTMLElement", FakeEl);
    const els = listScrollTops.map((t) => new FakeEl(t));
    vi.stubGlobal("document", {
      querySelectorAll: (sel: string) => (sel === "[data-messenger-hub-list-scroll]" ? els : []),
    });
    return import("@/lib/ui/ptr/use-dibay-ptr-gesture");
  }

  it("root at top but messenger list scrolled → NOT at top", async () => {
    const { isDibayPtrScrollAtTop } = await setup([320]);
    expect(isDibayPtrScrollAtTop("[data-messenger-hub-list-scroll]")).toBe(false);
  });

  it("root and list at top → at top", async () => {
    const { isDibayPtrScrollAtTop } = await setup([0]);
    expect(isDibayPtrScrollAtTop("[data-messenger-hub-list-scroll]")).toBe(true);
  });

  it("without extra selector, only the scroll root decides (other hubs unchanged)", async () => {
    const { isDibayPtrScrollAtTop } = await setup([320]);
    expect(isDibayPtrScrollAtTop()).toBe(true);
    rootScrollTop = 5;
    expect(isDibayPtrScrollAtTop()).toBe(false);
  });
});
