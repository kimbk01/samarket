/**
 * DIBAY Back SSOT CUT 3 — cart / order transaction contracts C1–C17.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { storeMenuHrefFromSlug } from "@/lib/navigation/dibay-entry-context";
import {
  clearNavigationEntryContext,
  clearOrdersNavigationEntryContext,
  commitDeliveryCartNavigationEntry,
  commitOrderCommittedNavigationEntry,
  commitOrdersHubNavigationEntry,
  readNavigationEntryContext,
  readOrdersNavigationEntryContext,
} from "@/lib/navigation/dibay-navigation-context-store";
import {
  DIBAY_ORDERS_HUB_FALLBACK,
  resolveDibayBackTarget,
} from "@/lib/navigation/resolve-dibay-back-target";
import { navigateToDeliveryStoreCart } from "@/lib/navigation/navigate-to-delivery-store-cart";
import { runStoreCartBackNavigation } from "@/lib/stores/store-cart-back-navigation";

const ROOT = join(__dirname, "..", "..", "..");

function stubSessionStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  });
}

describe("dibay-back-ssot-cut-3", () => {
  beforeEach(() => {
    stubSessionStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("C1 STORE → CART Back → STORE", () => {
    const ctx = commitDeliveryCartNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores/store-a",
      search: "",
    });
    expect(ctx.entryKind).toBe("cart_from_shopping");
    expect(ctx.semanticParentHref).toBe("/stores/store-a");
    const r = resolveDibayBackTarget({
      currentPathname: "/stores/store-a/cart",
      storeSlug: "store-a",
      entryContext: ctx,
    });
    expect(r.action).toBe("HISTORY");
    if (r.action === "HISTORY") {
      expect(r.fallbackHref).toBe("/stores/store-a");
    }
  });

  it("C2 PRODUCT → CART Back → store shopping parent", () => {
    const ctx = commitDeliveryCartNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores/store-a/p/prod-1",
      search: "",
    });
    const r = resolveDibayBackTarget({
      currentPathname: "/stores/store-a/cart",
      storeSlug: "store-a",
      entryContext: ctx,
    });
    expect(r.action).toBe("HISTORY");
    if (r.action === "HISTORY") {
      expect(r.fallbackHref).toBe("/stores/store-a");
    }
  });

  it("C3 CART 더 담기 remains FLOW (source contract)", () => {
    const client = readFileSync(
      join(ROOT, "components/stores/StoreCommerceCartPageClient.tsx"),
      "utf8"
    );
    expect(client).toMatch(/navigateToStoreMenu/);
    expect(client).toMatch(/router\.push\(`\/stores\/\$\{encodeURIComponent\(slug\)\}`/);
    expect(client).not.toMatch(/더 담기[\s\S]{0,80}runStoreCartBackNavigation/);
  });

  it("C4 confirm open → CLOSE not leave cart", () => {
    const ctx = commitDeliveryCartNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores/store-a",
      search: "",
    });
    const r = resolveDibayBackTarget({
      currentPathname: "/stores/store-a/cart",
      storeSlug: "store-a",
      entryContext: ctx,
      overlayOpen: true,
    });
    expect(r).toEqual({ action: "CLOSE", reason: "overlay_close" });
  });

  it("C5 confirm closed Cart Back → semantic parent", () => {
    const ctx = commitDeliveryCartNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores/store-a",
      search: "",
    });
    const r = resolveDibayBackTarget({
      currentPathname: "/stores/store-a/cart",
      storeSlug: "store-a",
      entryContext: ctx,
      overlayOpen: false,
    });
    expect(r.action).toBe("HISTORY");
  });

  it("C6 failed submit stays editable — no ORDER_COMMITTED stamp", () => {
    commitDeliveryCartNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores/store-a",
      search: "",
    });
    expect(readOrdersNavigationEntryContext()).toBeNull();
    const r = resolveDibayBackTarget({
      currentPathname: "/stores/store-a/cart",
      storeSlug: "store-a",
      entryContext: readNavigationEntryContext("store-a"),
    });
    expect(r.action).toBe("HISTORY");
  });

  it("C7 successful submit stamps ORDER_COMMITTED", () => {
    const ctx = commitOrderCommittedNavigationEntry({
      orderId: "ord-1",
      storeSlug: "store-a",
    });
    expect(ctx.transactionBoundary).toBe("ORDER_COMMITTED");
    expect(ctx.entryKind).toBe("order_committed");
    expect(readOrdersNavigationEntryContext()?.entityId).toBe("ord-1");
  });

  it("C8 ORDER_COMMITTED Back never resolves CART", () => {
    const ctx = commitOrderCommittedNavigationEntry({
      orderId: "ord-1",
      storeSlug: "store-a",
    });
    const r = resolveDibayBackTarget({
      currentPathname: "/orders",
      currentSearch: "?expand=ord-1",
      storeSlug: "store-a",
      entryContext: ctx,
    });
    expect(r.action).toBe("REPLACE");
    if (r.action === "REPLACE") {
      expect(r.targetHref).toBe(DIBAY_ORDERS_HUB_FALLBACK);
      expect(r.targetHref).not.toContain("/cart");
    }
  });

  it("C9 ORDER_COMMITTED never checkout/confirm destination", () => {
    const ctx = commitOrderCommittedNavigationEntry({
      orderId: "ord-1",
      storeSlug: "store-a",
    });
    const r = resolveDibayBackTarget({
      currentPathname: "/orders",
      currentSearch: "?expand=ord-1",
      storeSlug: "",
      entryContext: ctx,
    });
    if (r.action === "REPLACE" || r.action === "PUSH") {
      expect(r.targetHref).not.toMatch(/checkout|cart/);
    }
  });

  it("C10 success order destination semantic fallback → /orders", () => {
    const ctx = commitOrderCommittedNavigationEntry({
      orderId: "ord-1",
      storeSlug: "store-a",
    });
    expect(ctx.originHref).toBe("/orders");
    expect(ctx.semanticParentHref).toBe("/orders");
  });

  it("C11 direct order destination fallback → /orders", () => {
    const r = resolveDibayBackTarget({
      currentPathname: "/orders",
      currentSearch: "?expand=orphan",
      storeSlug: "",
      entryContext: null,
    });
    expect(r.action).toBe("HISTORY");
    if (r.action === "HISTORY") {
      expect(r.fallbackHref).toBe("/orders");
    }
  });

  it("C12 orders-origin detail returns orders context", () => {
    const ctx = commitOrdersHubNavigationEntry({ orderId: "ord-2", storeSlug: "store-a" });
    expect(ctx.entryKind).toBe("order_from_hub");
    const r = resolveDibayBackTarget({
      currentPathname: "/orders",
      currentSearch: "?expand=ord-2",
      storeSlug: "store-a",
      entryContext: ctx,
    });
    expect(r.action).toBe("HISTORY");
    if (r.action === "HISTORY") {
      expect(r.fallbackHref).toBe("/orders");
    }
  });

  it("C13 stale cart context cannot override committed order", () => {
    commitDeliveryCartNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores/store-a",
      search: "",
    });
    commitOrderCommittedNavigationEntry({ orderId: "ord-9", storeSlug: "store-a" });
    expect(readNavigationEntryContext("store-a")).toBeNull();
    const orders = readOrdersNavigationEntryContext();
    expect(orders?.transactionBoundary).toBe("ORDER_COMMITTED");
    const r = resolveDibayBackTarget({
      currentPathname: "/orders",
      currentSearch: "?expand=ord-9",
      storeSlug: "store-a",
      entryContext: orders,
    });
    if (r.action === "REPLACE" || r.action === "PUSH") {
      expect(r.targetHref).toBe("/orders");
    }
  });

  it("C14 latest navigation context wins", () => {
    commitOrderCommittedNavigationEntry({ orderId: "ord-old", storeSlug: "store-a" });
    commitOrderCommittedNavigationEntry({ orderId: "ord-new", storeSlug: "store-a" });
    expect(readOrdersNavigationEntryContext()?.entityId).toBe("ord-new");
  });

  it("C15 runStoreCartBackNavigation has no independent destination authority", () => {
    const src = readFileSync(join(ROOT, "lib/stores/store-cart-back-navigation.ts"), "utf8");
    expect(src).toContain("resolveDibayBackTarget");
    expect(src).toContain("runDibayBackResolution");
    expect(src).not.toMatch(/import\s*\{[^}]*runHistoryBackWithFallback/);
    expect(src).not.toMatch(/runHistoryBackWithFallback\s*\(/);
  });

  it("C16 더 담기 remains FLOW (navigateToStoreMenu push)", () => {
    const client = readFileSync(
      join(ROOT, "components/stores/cart/baemin/StoreBaeminCartStoreBlock.tsx"),
      "utf8"
    );
    expect(client).toContain("store_cart_add_menu");
    expect(client).toContain("onBackToStore");
  });

  it("C17 CUT 2C product navigation untouched", () => {
    const pending = readFileSync(
      join(ROOT, "lib/navigation/delivery-store-product-pending.ts"),
      "utf8"
    );
    const commit = readFileSync(
      join(ROOT, "components/navigation/DeliveryStoreProductChildCommit.tsx"),
      "utf8"
    );
    const owner = readFileSync(
      join(ROOT, "lib/navigation/navigate-to-delivery-store-product.ts"),
      "utf8"
    );
    expect(pending).toContain("armDeliveryStoreProductPending");
    expect(commit).toContain("DeliveryStoreProductChildCommit");
    expect(owner).toContain("navigateToDeliveryStoreProduct");
  });

  it("canonical cart entry owner pushes cart only", () => {
    const pushes: string[] = [];
    const router = { push: (href: string) => pushes.push(href) };
    navigateToDeliveryStoreCart(router, {
      storeSlug: "store-a",
      pathname: "/stores/store-a",
      search: "",
    });
    expect(pushes).toEqual([`${storeMenuHrefFromSlug("store-a")}/cart`]);
    expect(readNavigationEntryContext("store-a")?.entryKind).toBe("cart_from_shopping");
  });

  it("thin cart adapter CLOSE calls onCloseOverlay", () => {
    let closed = false;
    const router = {
      back: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
    };
    commitDeliveryCartNavigationEntry({
      storeSlug: "store-a",
      pathname: "/stores/store-a",
      search: "",
    });
    runStoreCartBackNavigation(router, "store-a", {
      overlayOpen: true,
      onCloseOverlay: () => {
        closed = true;
      },
      pathname: "/stores/store-a/cart",
      search: "",
    });
    expect(closed).toBe(true);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  afterEach(() => {
    clearNavigationEntryContext("store-a");
    clearOrdersNavigationEntryContext();
  });
});
