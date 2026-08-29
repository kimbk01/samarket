/**
 * DIBAY Back SSOT CUT 1/2 — unit contracts T1–T12.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sanitizeDibayInternalHref,
  storeMenuHrefFromSlug,
  type NavigationEntryContext,
} from "@/lib/navigation/dibay-entry-context";
import {
  clearNavigationEntryContext,
  commitDeliveryStoreNavigationEntry,
  readNavigationEntryContext,
  writeNavigationEntryContext,
} from "@/lib/navigation/dibay-navigation-context-store";
import {
  DIBAY_DELIVERY_ROOT_FALLBACK,
  resolveDeliveryProductDepthBack,
  resolveDibayBackTarget,
} from "@/lib/navigation/resolve-dibay-back-target";

function stubSessionStorage() {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal("sessionStorage", sessionStorage);
  return store;
}

function expectHistoryOrigin(resolution: ReturnType<typeof resolveDibayBackTarget>, href: string) {
  expect(resolution.action).toBe("HISTORY");
  if (resolution.action === "HISTORY") {
    expect(resolution.fallbackHref).toBe(href);
  }
}

function expectReplaceStore(resolution: ReturnType<typeof resolveDibayBackTarget>, slug: string) {
  expect(resolution.action).toBe("REPLACE");
  if (resolution.action === "REPLACE") {
    expect(resolution.targetHref).toBe(storeMenuHrefFromSlug(slug));
    // Without historyIncludesStoreParent — deep-link / unaligned product entry
    expect(resolution.reason).toBe("semantic_parent_store_menu_deeplink");
  }
}

describe("dibay-back-ssot-cut-1-2", () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("T1 HOME STORE → back HOME", () => {
    const ctx = commitDeliveryStoreNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores",
      search: "",
      productId: null,
    });
    expect(ctx.originHref).toBe("/stores");
    expect(ctx.entryKind).toBe("store_card");
    const r = resolveDibayBackTarget({
      currentPathname: "/stores/store-a",
      currentSearch: "",
      storeSlug: "store-a",
      entryContext: ctx,
    });
    expectHistoryOrigin(r, "/stores");
  });

  it("T2 HOME PRODUCT → back #1 store, #2 HOME", () => {
    const ctx = commitDeliveryStoreNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores",
      search: "",
      productId: "prod-1",
    });
    expect(ctx.originSurface).toBe("HOME_SHELF");
    expect(ctx.entryKind).toBe("product_from_list");
    expect(ctx.semanticParentHref).toBe("/stores/store-a");

    const back1 = resolveDibayBackTarget({
      currentPathname: "/stores/store-a",
      currentSearch: "?focusProduct=prod-1",
      storeSlug: "store-a",
      entryContext: ctx,
    });
    expectReplaceStore(back1, "store-a");

    const back2 = resolveDibayBackTarget({
      currentPathname: "/stores/store-a",
      currentSearch: "",
      storeSlug: "store-a",
      entryContext: ctx,
    });
    expectHistoryOrigin(back2, "/stores");
  });

  it("T3 BROWSE STORE → exact browse href incl sort", () => {
    const browse = "/stores/browse/restaurant?sub=all&sort=popular";
    const ctx = commitDeliveryStoreNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores/browse/restaurant",
      search: "?sub=all&sort=popular",
      productId: null,
    });
    expect(ctx.originHref).toBe(browse);
    const r = resolveDibayBackTarget({
      currentPathname: "/stores/store-a",
      storeSlug: "store-a",
      entryContext: ctx,
    });
    expectHistoryOrigin(r, browse);
  });

  it("T4 BROWSE PRODUCT → store then browse", () => {
    const browse = "/stores/browse/restaurant?sub=korean&sort=rating";
    const ctx = commitDeliveryStoreNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores/browse/restaurant",
      search: "?sub=korean&sort=rating",
      productId: "prod-9",
    });
    expect(ctx.originHref).toBe(browse);
    expectReplaceStore(
      resolveDibayBackTarget({
        currentPathname: "/stores/store-a",
        currentSearch: "?focusProduct=prod-9",
        storeSlug: "store-a",
        entryContext: ctx,
      }),
      "store-a"
    );
    expectHistoryOrigin(
      resolveDibayBackTarget({
        currentPathname: "/stores/store-a",
        storeSlug: "store-a",
        entryContext: ctx,
      }),
      browse
    );
  });

  it("T5 SEARCH STORE", () => {
    const searchHref = "/stores/search?q=chicken";
    const ctx = commitDeliveryStoreNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores/search",
      search: "?q=chicken",
      productId: null,
    });
    expect(ctx.originHref).toBe(searchHref);
    expectHistoryOrigin(
      resolveDibayBackTarget({
        currentPathname: "/stores/store-a",
        storeSlug: "store-a",
        entryContext: ctx,
      }),
      searchHref
    );
  });

  it("T6 SEARCH PRODUCT", () => {
    const searchHref = "/stores/search?q=chicken";
    const ctx = commitDeliveryStoreNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores/search",
      search: "?q=chicken",
      productId: "prod-1",
    });
    expectReplaceStore(
      resolveDibayBackTarget({
        currentPathname: `/stores/store-a/p/prod-1`,
        storeSlug: "store-a",
        entryContext: ctx,
      }),
      "store-a"
    );
    expectHistoryOrigin(
      resolveDibayBackTarget({
        currentPathname: "/stores/store-a",
        storeSlug: "store-a",
        entryContext: ctx,
      }),
      searchHref
    );
  });

  it("T7 DEEP LINK PRODUCT → store then /stores", () => {
    const ctx = commitDeliveryStoreNavigationEntry({
      storeSlug: "store-a",
      pathname: "/external-entry",
      search: "",
      productId: "prod-1",
    });
    expect(ctx.originHref).toBeNull();
    expect(ctx.originSurface).toBe("DEEP_LINK");
    expectReplaceStore(
      resolveDibayBackTarget({
        currentPathname: "/stores/store-a/p/prod-1",
        storeSlug: "store-a",
        entryContext: ctx,
      }),
      "store-a"
    );
    const back2 = resolveDibayBackTarget({
      currentPathname: "/stores/store-a",
      storeSlug: "store-a",
      entryContext: ctx,
    });
    expect(back2.action).toBe("PUSH");
    if (back2.action === "PUSH") {
      expect(back2.targetHref).toBe(DIBAY_DELIVERY_ROOT_FALLBACK);
    }
  });

  it("T8 INVALID ORIGIN rejected", () => {
    expect(sanitizeDibayInternalHref("https://evil.example/x")).toBeNull();
    expect(sanitizeDibayInternalHref("//evil.example")).toBeNull();
    const ctx = commitDeliveryStoreNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores",
      search: "",
      productId: null,
      originHrefOverride: "https://evil.example/phish",
      originSurfaceOverride: "HOME",
    });
    // override rejected → falls through to pathname classification (/stores)
    expect(ctx.originHref).toBe("/stores");
  });

  it("T9 STALE CONTEXT must not hijack", () => {
    const ctx = commitDeliveryStoreNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores",
      search: "",
      productId: null,
    });
    const stale: NavigationEntryContext = {
      ...ctx,
      createdAt: Date.now() - ctx.ttlMs - 1,
    };
    writeNavigationEntryContext(stale);
    expect(readNavigationEntryContext("store-a")).toBeNull();
    const r = resolveDibayBackTarget({
      currentPathname: "/stores/store-a",
      storeSlug: "store-a",
      entryContext: stale,
      now: Date.now(),
    });
    expect(r.action).toBe("PUSH");
    if (r.action === "PUSH") {
      expect(r.targetHref).toBe(DIBAY_DELIVERY_ROOT_FALLBACK);
      expect(r.reason).toContain("stale");
    }
  });

  it("T10 LATEST ENTRY WINS", () => {
    commitDeliveryStoreNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores",
      search: "",
      productId: null,
    });
    commitDeliveryStoreNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores/browse/cafe",
      search: "?sub=dessert&sort=distance",
      productId: null,
    });
    const ctx = readNavigationEntryContext("store-a");
    expect(ctx?.originHref).toBe("/stores/browse/cafe?sub=dessert&sort=distance");
    expectHistoryOrigin(
      resolveDibayBackTarget({
        currentPathname: "/stores/store-a",
        storeSlug: "store-a",
        entryContext: ctx,
      }),
      "/stores/browse/cafe?sub=dessert&sort=distance"
    );
  });

  it("T11 PRODUCT PATH PARITY focusProduct vs /p/", () => {
    const ctx = commitDeliveryStoreNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores",
      search: "",
      productId: "prod-1",
    });
    const a = resolveDeliveryProductDepthBack({
      storeSlug: "store-a",
      entryContext: ctx,
      pathMode: "focusProduct",
      productId: "prod-1",
    });
    const b = resolveDeliveryProductDepthBack({
      storeSlug: "store-a",
      entryContext: ctx,
      pathMode: "productPage",
      productId: "prod-1",
    });
    expect(a).toEqual(b);
    expectReplaceStore(a, "store-a");
  });

  it("T12 SORT PRESERVE in originHref", () => {
    const href = "/stores/browse/restaurant?sub=all&sort=popular";
    const ctx = commitDeliveryStoreNavigationEntry({
      storeSlug: "store-b",
      pathname: "/stores/browse/restaurant",
      search: "?sub=all&sort=popular",
      productId: null,
    });
    expect(ctx.originHref).toBe(href);
    expect(ctx.originHref).toContain("sort=popular");
    clearNavigationEntryContext("store-b");
  });
});
