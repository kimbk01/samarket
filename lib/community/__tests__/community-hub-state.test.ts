import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COMMUNITY_HUB_STATE_KEY,
  resolveCommunityBottomNavEntryHref,
  writeCommunityHubState,
} from "@/lib/community/community-hub-state";
import { resolveMainBottomNavTabTapHref } from "@/lib/main-menu/main-bottom-nav-tab-emphasis";

function createSessionStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe("resolveCommunityBottomNavEntryHref", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sessionStorage: createSessionStorageMock() },
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: (globalThis as { window: { sessionStorage: Storage } }).window.sessionStorage,
    });
  });

  afterEach(() => {
    sessionStorage.removeItem(COMMUNITY_HUB_STATE_KEY);
  });

  it("expands bare /philife from other hubs to last topic", () => {
    writeCommunityHubState({ kind: "topic", topicSlug: "philippines", allSort: "latest" });
    expect(resolveCommunityBottomNavEntryHref("/philife", { fromPathname: "/market" })).toBe(
      "/philife?category=philippines"
    );
  });

  it("expands from delivery / mypage / messenger", () => {
    writeCommunityHubState({ kind: "topic", topicSlug: "philippines", allSort: "latest" });
    expect(resolveCommunityBottomNavEntryHref("/philife", { fromPathname: "/stores" })).toContain(
      "category=philippines"
    );
    expect(resolveCommunityBottomNavEntryHref("/philife", { fromPathname: "/mypage" })).toContain(
      "category=philippines"
    );
    expect(
      resolveCommunityBottomNavEntryHref("/philife", { fromPathname: "/community-messenger" })
    ).toContain("category=philippines");
  });

  it("does not expand when already on community hub root (scroll-only)", () => {
    writeCommunityHubState({ kind: "topic", topicSlug: "philippines", allSort: "latest" });
    expect(resolveCommunityBottomNavEntryHref("/philife", { fromPathname: "/philife" })).toBe(
      "/philife"
    );
  });

  it("expands when leaving a philife deep route back to hub", () => {
    writeCommunityHubState({ kind: "topic", topicSlug: "philippines", allSort: "latest" });
    expect(
      resolveCommunityBottomNavEntryHref("/philife", { fromPathname: "/philife/post/abc" })
    ).toBe("/philife?category=philippines");
  });

  it("keeps explicit nav params and default all without saved topic", () => {
    expect(
      resolveCommunityBottomNavEntryHref("/philife?nav=all&sort=latest", { fromPathname: "/market" })
    ).toBe("/philife?nav=all&sort=latest");
    expect(resolveCommunityBottomNavEntryHref("/philife", { fromPathname: "/market" })).toBe(
      "/philife"
    );
  });

  it("restores local and all+popular", () => {
    writeCommunityHubState({ kind: "local", topicSlug: "", allSort: "latest" });
    expect(resolveCommunityBottomNavEntryHref("/philife", { fromPathname: "/market" })).toContain(
      "nav=local"
    );
    writeCommunityHubState({ kind: "all", topicSlug: "", allSort: "popular" });
    expect(resolveCommunityBottomNavEntryHref("/philife", { fromPathname: "/market" })).toMatch(
      /nav=all.*sort=popular|sort=popular.*nav=all/
    );
  });
});

describe("resolveMainBottomNavTabTapHref community restore", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sessionStorage: createSessionStorageMock() },
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: (globalThis as { window: { sessionStorage: Storage } }).window.sessionStorage,
    });
  });

  afterEach(() => {
    sessionStorage.removeItem(COMMUNITY_HUB_STATE_KEY);
  });

  it("community tab from market restores last topic", () => {
    writeCommunityHubState({ kind: "topic", topicSlug: "philippines", allSort: "latest" });
    expect(
      resolveMainBottomNavTabTapHref("community", "/philife", {
        pathname: "/market",
      })
    ).toBe("/philife?category=philippines");
  });

  it("community tab while on hub root stays bare", () => {
    writeCommunityHubState({ kind: "topic", topicSlug: "philippines", allSort: "latest" });
    expect(
      resolveMainBottomNavTabTapHref("community", "/philife", {
        emphasisKind: "domain-hub",
        pathname: "/philife",
      })
    ).toBe("/philife");
  });
});
