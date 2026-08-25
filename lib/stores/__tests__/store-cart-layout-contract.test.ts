import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("store cart layout contract", () => {
  it("uses viewport-locked flex shell (header/footer pinned, middle scrolls)", () => {
    const layout = readRepo("lib/stores/store-cart-page-layout.ts");
    expect(layout).toContain("STORE_CART_PAGE_ROOT_CLASS");
    expect(layout).toContain("STORE_CART_SCROLL_BODY_CLASS");
    expect(layout).toContain("STORE_CART_HEADER_CHROME_CLASS");
    expect(layout).toContain("STORE_CART_FOOTER_CHROME_CLASS");
    expect(layout).toMatch(/flex-1/);
    expect(layout).toMatch(/overflow-y-auto/);
    expect(layout).toMatch(/-webkit-overflow-scrolling:touch/);
    expect(layout).toMatch(/\bh-0\b/);

    const globals = readRepo("app/globals.css");
    expect(globals).toContain("main-shell-push-surface--child-scroll");

    const routeTransition = readRepo("components/route-transition/AppRouteTransition.tsx");
    expect(routeTransition).toContain("isStoreCommerceCartCheckoutPath");
    expect(routeTransition).toContain("data-main-shell-child-scroll");

    const deliveryPresentation = readRepo("components/delivery/presentation/DeliveryPresentationShell.tsx");
    expect(deliveryPresentation).toContain("onCartCheckoutHardRoute");
    expect(deliveryPresentation).toContain("isStoreCommerceCartCheckoutPath");
    expect(deliveryPresentation).toContain("data-delivery-cart-hard-route");
    expect(deliveryPresentation).toMatch(/suppressNextChildrenPaint[\s\S]*!onCartCheckoutHardRoute/);

    const shell = readRepo("components/stores/cart/StoreCommerceCartPageShell.tsx");
    expect(shell).toContain("header");
    expect(shell).toContain("data-store-cart-scroll");
    expect(shell).toContain("StoreCartSwipeBackShell");

    const backNav = readRepo("lib/stores/store-cart-back-navigation.ts");
    expect(backNav).toContain("runHistoryBackWithFallback");

    const flags = readRepo("lib/layout/conditional-app-shell-flags.ts");
    expect(flags).toContain("isStoreCommerceCartCheckoutPage");
    expect(flags).toContain("isStoreCommerceCartCheckoutPath");
    expect(flags).toContain("isMainColumnViewportLocked");
  });
});
