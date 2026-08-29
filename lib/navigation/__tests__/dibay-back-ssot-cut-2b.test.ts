/**
 * DIBAY Back SSOT CUT 2B — semantic history alignment (T13–T22).
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
  armDeliveryStoreProductPending,
  clearDeliveryStoreProductPending,
  consumeDeliveryStoreProductPending,
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

function alignedProductCtx(
  input: Parameters<typeof commitDeliveryStoreNavigationEntry>[0]
) {
  const base = commitDeliveryStoreNavigationEntry(input);
  const aligned = { ...base, historyIncludesStoreParent: true as const };
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

describe("dibay-back-ssot-cut-2b", () => {
  beforeEach(() => {
    stubSessionStorage();
    resetDeliveryStoreProductPendingForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetDeliveryStoreProductPendingForTests();
  });

  it("T13 HOME PRODUCT HISTORY INTENT — resolver HISTORY → store", () => {
    const ctx = alignedProductCtx({
      storeSlug: "store-a",
      pathname: "/stores",
      search: "",
      productId: "prod-1",
    });
    expect(ctx.originHref).toBe("/stores");
    expect(ctx.historyIncludesStoreParent).toBe(true);
    expectHistoryStore(
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
    expect(back2.action).toBe("HISTORY");
    if (back2.action === "HISTORY") {
      expect(back2.fallbackHref).toBe("/stores");
    }
  });

  it("T14 BROWSE PRODUCT HISTORY INTENT — exact browse origin", () => {
    const browse = "/stores/browse/restaurant?sub=all&sort=popular";
    const ctx = alignedProductCtx({
      storeSlug: "store-a",
      pathname: "/stores/browse/restaurant",
      search: "?sub=all&sort=popular",
      productId: "prod-2",
    });
    expect(ctx.originHref).toBe(browse);
    expectHistoryStore(
      resolveDibayBackTarget({
        currentPathname: "/stores/store-a",
        currentSearch: "?focusProduct=prod-2",
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
    expect(back2.action).toBe("HISTORY");
    if (back2.action === "HISTORY") {
      expect(back2.fallbackHref).toBe(browse);
    }
  });

  it("T15 SEARCH PRODUCT HISTORY INTENT", () => {
    const searchHref = "/stores/search?q=chicken";
    const ctx = alignedProductCtx({
      storeSlug: "store-a",
      pathname: "/stores/search",
      search: "?q=chicken",
      productId: "prod-1",
    });
    expect(ctx.originHref).toBe(searchHref);
    expectHistoryStore(
      resolveDibayBackTarget({
        currentPathname: `/stores/store-a/p/prod-1`,
        storeSlug: "store-a",
        entryContext: ctx,
      }),
      "store-a"
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

  it("T17 HEADER RESOLUTION WITH SAFE PRODUCT HISTORY", () => {
    const ctx = alignedProductCtx({
      storeSlug: "store-a",
      pathname: "/stores",
      search: "",
      productId: "prod-1",
    });
    expectHistoryStore(
      resolveDibayBackTarget({
        currentPathname: "/stores/store-a/p/prod-1",
        storeSlug: "store-a",
        entryContext: ctx,
      }),
      "store-a"
    );
  });

  it("T18 STORE RESOLUTION — HISTORY → origin", () => {
    const ctx = alignedProductCtx({
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

  it("T20 PRODUCT PATH PARITY /p/id vs ?focusProduct=", () => {
    const ctx = alignedProductCtx({
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
    expectHistoryStore(a, "store-a");
  });

  it("T21 LATEST ENTRY WINS — browse product replaces home product context", () => {
    alignedProductCtx({
      storeSlug: "store-a",
      pathname: "/stores",
      search: "",
      productId: "prod-home",
    });
    const browse = "/stores/browse/restaurant?sub=all&sort=popular";
    const ctx = alignedProductCtx({
      storeSlug: "store-a",
      pathname: "/stores/browse/restaurant",
      search: "?sub=all&sort=popular",
      productId: "prod-browse",
    });
    expect(readNavigationEntryContext("store-a")?.originHref).toBe(browse);
    expect(ctx.productId).toBe("prod-browse");
    const storeBack = resolveDibayBackTarget({
      currentPathname: "/stores/store-a",
      storeSlug: "store-a",
      entryContext: ctx,
    });
    expect(storeBack.action).toBe("HISTORY");
    if (storeBack.action === "HISTORY") {
      expect(storeBack.fallbackHref).toBe(browse);
    }
  });

  it("T22 CANCEL/INTERRUPT SAFETY — clear pending leaves no stale child", () => {
    armDeliveryStoreProductPending({
      storeSlug: "store-a",
      productId: "prod-1",
      childMode: "productPage",
      transactionId: "tx-1",
    });
    expect(peekDeliveryStoreProductPending("store-a")?.productId).toBe("prod-1");
    clearDeliveryStoreProductPending("store-a");
    expect(peekDeliveryStoreProductPending("store-a")).toBeNull();
    expect(consumeDeliveryStoreProductPending("store-a")).toBeNull();
  });

  it("canonical owner arms pending and pushes STORE only (stage-1)", () => {
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
    expect(pushes).toEqual([storeDetailHrefFromSlug("store-a")]);
    const pending = peekDeliveryStoreProductPending("store-a");
    expect(pending?.productHref).toBe("/stores/store-a/p/prod-1");
    expect(readNavigationEntryContext("store-a")?.historyIncludesStoreParent).toBe(true);
    clearNavigationEntryContext("store-a");
  });
});
