/**
 * DIBAY Back SSOT CUT 2B — single-action product / store history (T13–T22).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storeMenuHrefFromSlug } from "@/lib/navigation/dibay-entry-context";
import {
  clearNavigationEntryContext,
  commitDeliveryStoreNavigationEntry,
  readNavigationEntryContext,
  writeNavigationEntryContext,
} from "@/lib/navigation/dibay-navigation-context-store";
import {
  clearDeliveryStoreProductPending,
  peekDeliveryStoreProductPending,
  resetDeliveryStoreProductPendingForTests,
} from "@/lib/navigation/delivery-store-product-pending";
import {
  navigateToDeliveryStoreCard,
  navigateToDeliveryStoreProduct,
} from "@/lib/navigation/navigate-to-delivery-store-product";
import {
  DIBAY_DELIVERY_ROOT_FALLBACK,
  resolveDeliveryProductDepthBack,
  resolveDibayBackTarget,
} from "@/lib/navigation/resolve-dibay-back-target";
import { storeDetailHrefFromSlug } from "@/lib/dibay/store-detail-href";

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

/** STORE → PRODUCT (user was already on store). */
function storeParentProductCtx(
  input: Parameters<typeof commitDeliveryStoreNavigationEntry>[0]
) {
  const base = commitDeliveryStoreNavigationEntry(input);
  const aligned = { ...base, historyIncludesStoreParent: true as const };
  writeNavigationEntryContext(aligned);
  return aligned;
}

/** HOME/browse/search → PRODUCT direct (no synthetic STORE history). */
function directProductCtx(
  input: Parameters<typeof commitDeliveryStoreNavigationEntry>[0]
) {
  const base = commitDeliveryStoreNavigationEntry(input);
  const aligned = { ...base, historyIncludesStoreParent: false as const };
  writeNavigationEntryContext(aligned);
  return aligned;
}

function expectHistoryStore(
  resolution: ReturnType<typeof resolveDibayBackTarget>,
  slug: string
) {
  expect(resolution.action).toBe("HISTORY");
  if (resolution.action === "HISTORY") {
    expect(resolution.fallbackHref).toBe(storeMenuHrefFromSlug(slug));
    expect(resolution.reason).toBe("history_semantic_parent_store");
  }
}

function expectOriginHistory(
  resolution: ReturnType<typeof resolveDibayBackTarget>,
  originHref: string
) {
  expect(resolution.action).toBe("HISTORY");
  if (resolution.action === "HISTORY") {
    expect(resolution.fallbackHref).toBe(originHref);
    expect(resolution.reason).toMatch(/^origin_return:/);
  }
}

describe("dibay-back-ssot-cut-2b", () => {
  beforeEach(() => {
    stubSessionStorage();
    resetDeliveryStoreProductPendingForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetDeliveryStoreProductPendingForTests();
  });

  it("T13 HOME → PRODUCT → BACK = HOME (no synthetic STORE)", () => {
    const ctx = directProductCtx({
      storeSlug: "store-a",
      pathname: "/stores",
      search: "",
      productId: "prod-1",
    });
    expect(ctx.originHref).toBe("/stores");
    expect(ctx.historyIncludesStoreParent).toBe(false);
    expectOriginHistory(
      resolveDibayBackTarget({
        currentPathname: "/stores/store-a/p/prod-1",
        storeSlug: "store-a",
        entryContext: ctx,
      }),
      "/stores"
    );
  });

  it("T13b STORE → PRODUCT → BACK = STORE", () => {
    const ctx = storeParentProductCtx({
      storeSlug: "store-a",
      pathname: "/stores/store-a",
      search: "",
      productId: "prod-1",
    });
    expect(ctx.historyIncludesStoreParent).toBe(true);
    expectHistoryStore(
      resolveDibayBackTarget({
        currentPathname: "/stores/store-a/p/prod-1",
        storeSlug: "store-a",
        entryContext: ctx,
      }),
      "store-a"
    );
  });

  it("T14 BROWSE → PRODUCT → BACK = BROWSE", () => {
    const browse = "/stores/browse/restaurant?sub=all&sort=popular";
    const ctx = directProductCtx({
      storeSlug: "store-a",
      pathname: "/stores/browse/restaurant",
      search: "?sub=all&sort=popular",
      productId: "prod-2",
    });
    expect(ctx.originHref).toBe(browse);
    expectOriginHistory(
      resolveDibayBackTarget({
        currentPathname: "/stores/store-a/p/prod-2",
        storeSlug: "store-a",
        entryContext: ctx,
      }),
      browse
    );
  });

  it("T15 SEARCH → PRODUCT → BACK = SEARCH", () => {
    const searchHref = "/stores/search?q=chicken";
    const ctx = directProductCtx({
      storeSlug: "store-a",
      pathname: "/stores/search",
      search: "?q=chicken",
      productId: "prod-1",
    });
    expect(ctx.originHref).toBe(searchHref);
    expectOriginHistory(
      resolveDibayBackTarget({
        currentPathname: `/stores/store-a/p/prod-1`,
        storeSlug: "store-a",
        entryContext: ctx,
      }),
      searchHref
    );
  });

  it("T16 STORE CARD NO EXTRA DEPTH — owner pushes store only", () => {
    const pushes: string[] = [];
    const router = { push: (href: string) => pushes.push(href) };
    navigateToDeliveryStoreCard(router, {
      storeSlug: "store-a",
      pathname: "/stores",
      search: "",
      saveScroll: false,
    });
    expect(pushes).toEqual([storeDetailHrefFromSlug("store-a")]);
    expect(peekDeliveryStoreProductPending("store-a")).toBeNull();
    const ctx = readNavigationEntryContext("store-a");
    expect(ctx?.entryKind).toBe("store_card");
    expect(ctx?.historyIncludesStoreParent).not.toBe(true);
  });

  it("T17 HEADER RESOLUTION — HOME product back to HOME", () => {
    const ctx = directProductCtx({
      storeSlug: "store-a",
      pathname: "/stores",
      search: "",
      productId: "prod-1",
    });
    expectOriginHistory(
      resolveDibayBackTarget({
        currentPathname: "/stores/store-a/p/prod-1",
        storeSlug: "store-a",
        entryContext: ctx,
      }),
      "/stores"
    );
  });

  it("T18 STORE RESOLUTION — HISTORY → origin after product_from_list", () => {
    const ctx = directProductCtx({
      storeSlug: "store-a",
      pathname: "/stores",
      search: "",
      productId: "prod-1",
    });
    const r = resolveDibayBackTarget({
      currentPathname: "/stores/store-a",
      storeSlug: "store-a",
      entryContext: ctx,
    });
    expect(r.action).toBe("HISTORY");
    if (r.action === "HISTORY") {
      expect(r.fallbackHref).toBe("/stores");
    }
  });

  it("T19 DEEP LINK PRODUCT — SEMANTIC_PARENT REPLACE → STORE", () => {
    const ctx = commitDeliveryStoreNavigationEntry({
      storeSlug: "store-a",
      pathname: "/external-entry",
      search: "",
      productId: "prod-1",
    });
    expect(ctx.historyIncludesStoreParent).not.toBe(true);
    const r = resolveDibayBackTarget({
      currentPathname: "/stores/store-a/p/prod-1",
      storeSlug: "store-a",
      entryContext: ctx,
    });
    expect(r.action).toBe("REPLACE");
    if (r.action === "REPLACE") {
      expect(r.targetHref).toBe(storeMenuHrefFromSlug("store-a"));
      expect(r.reason).toBe("semantic_parent_store_menu_deeplink");
    }
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

  it("T20 PRODUCT PATH PARITY /p/id vs ?focusProduct= (direct origin)", () => {
    const ctx = directProductCtx({
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
    expectOriginHistory(a, "/stores");
  });

  it("T21 LATEST ENTRY WINS — browse product replaces home product context", () => {
    directProductCtx({
      storeSlug: "store-a",
      pathname: "/stores",
      search: "",
      productId: "prod-home",
    });
    const browse = "/stores/browse/restaurant?sub=all&sort=popular";
    const ctx = directProductCtx({
      storeSlug: "store-a",
      pathname: "/stores/browse/restaurant",
      search: "?sub=all&sort=popular",
      productId: "prod-browse",
    });
    expect(readNavigationEntryContext("store-a")?.originHref).toBe(browse);
    expect(ctx.productId).toBe("prod-browse");
    expectOriginHistory(
      resolveDibayBackTarget({
        currentPathname: "/stores/store-a/p/prod-browse",
        storeSlug: "store-a",
        entryContext: ctx,
      }),
      browse
    );
  });

  it("T22 CANCEL/INTERRUPT SAFETY — clear pending leaves no stale child", () => {
    clearDeliveryStoreProductPending("store-a");
    expect(peekDeliveryStoreProductPending("store-a")).toBeNull();
  });

  it("SINGLE-ACTION: HOME product intent → one product push (no store stage)", () => {
    const pushes: string[] = [];
    const router = { push: (href: string) => pushes.push(href) };
    navigateToDeliveryStoreProduct(router, {
      storeSlug: "store-a",
      productId: "prod-1",
      childMode: "productPage",
      pathname: "/stores",
      search: "",
      saveScroll: false,
    });
    expect(pushes).toEqual(["/stores/store-a/p/prod-1"]);
    expect(peekDeliveryStoreProductPending("store-a")).toBeNull();
    expect(readNavigationEntryContext("store-a")?.historyIncludesStoreParent).toBe(false);
    clearNavigationEntryContext("store-a");
  });

  it("SINGLE-ACTION: STORE product intent → one product push + store parent flag", () => {
    const pushes: string[] = [];
    const router = { push: (href: string) => pushes.push(href) };
    navigateToDeliveryStoreProduct(router, {
      storeSlug: "store-a",
      productId: "prod-1",
      childMode: "productPage",
      pathname: "/stores/store-a",
      search: "",
      saveScroll: false,
    });
    expect(pushes).toEqual(["/stores/store-a/p/prod-1"]);
    expect(peekDeliveryStoreProductPending("store-a")).toBeNull();
    expect(readNavigationEntryContext("store-a")?.historyIncludesStoreParent).toBe(true);
    clearNavigationEntryContext("store-a");
  });
});
