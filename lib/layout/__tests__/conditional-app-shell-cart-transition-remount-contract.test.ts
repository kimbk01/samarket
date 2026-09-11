import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { resolvesMainHubScrollColumn } from "@/lib/layout/main-hub-scroll-column";
import { resolvesMainScrollInMainColumn } from "@/lib/layout/main-shell-viewport";

/**
 * R3 — store/product → cart must not remount AppRouteTransition.
 * Viewport-lock flips hubScrollColumn; ConditionalAppShell must keep one stable
 * `<main>` parent around MainShellTabContentTransition (className only).
 */
describe("conditional-app-shell cart transition remount contract", () => {
  it("store menu → slug cart flips hubScrollColumn (the remount hazard)", () => {
    const store = resolveConditionalAppShellFlags("/stores/aa11", true);
    const cart = resolveConditionalAppShellFlags("/stores/aa11/cart", true);

    const storeHub = resolvesMainHubScrollColumn({
      regionBarInLayout: true,
      mainScrollInMainColumn: resolvesMainScrollInMainColumn({
        isChatRoomDetail: store.isChatRoomDetail,
        isStoreOwnerAdminRoute: store.isStoreOwnerAdminRoute,
        isMainColumnViewportLocked: store.isMainColumnViewportLocked,
      }),
      isChatRoomDetail: store.isChatRoomDetail,
    });
    const cartHub = resolvesMainHubScrollColumn({
      regionBarInLayout: true,
      mainScrollInMainColumn: resolvesMainScrollInMainColumn({
        isChatRoomDetail: cart.isChatRoomDetail,
        isStoreOwnerAdminRoute: cart.isStoreOwnerAdminRoute,
        isMainColumnViewportLocked: cart.isMainColumnViewportLocked,
      }),
      isChatRoomDetail: cart.isChatRoomDetail,
    });

    expect(store.isStoreCommerceCartCheckoutPage).toBe(false);
    expect(cart.isStoreCommerceCartCheckoutPage).toBe(true);
    expect(storeHub).toBe(true);
    expect(cartHub).toBe(false);
  });

  it("ConditionalAppShell keeps one stable main host (no hub/locked ternary remount)", () => {
    const src = readFileSync(
      join(process.cwd(), "components/layout/ConditionalAppShell.tsx"),
      "utf8"
    );
    expect(src).toContain("STABLE PARENT for `MainShellTabContentTransition`");
    expect(src).toContain("remount wiped enter animation");
    // Forbidden pattern: hubScrollColumn ? mainBodyTransition : <main>…mainBodyTransition
    expect(src).not.toMatch(
      /hubScrollColumn\s*\?\s*\([\s\S]*?mainBodyTransition[\s\S]*?\)\s*:\s*\(\s*<main/
    );
  });
});
