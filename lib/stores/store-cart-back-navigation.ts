/**
 * CUT 3 — Cart Back thin adapter.
 * Destination policy: resolveDibayBackTarget only.
 * DO NOT call runHistoryBackWithFallback with an independent fallback decision.
 */

import { readNavigationEntryContext } from "@/lib/navigation/dibay-navigation-context-store";
import { resolveDibayBackTarget } from "@/lib/navigation/resolve-dibay-back-target";
import { runDibayBackResolution } from "@/lib/navigation/run-dibay-back-resolution";
import { storeMenuHrefFromSlug } from "@/lib/navigation/dibay-entry-context";

/** @deprecated Fallback href helper kept for tests — not a Back policy owner. */
export function buildStoreCartBackFallbackHref(storeSlug: string): string {
  const slug = storeSlug.trim();
  if (slug) return storeMenuHrefFromSlug(slug);
  return "/stores";
}

export type RunStoreCartBackNavigationOptions = {
  overlayOpen?: boolean;
  onCloseOverlay?: () => void;
  pathname?: string;
  search?: string;
  animatedBack?: ((navigate: () => void) => void) | null;
};

/**
 * Cart header / swipe — resolve via global Dibay SSOT then execute.
 */
export function runStoreCartBackNavigation(
  router: {
    back: () => void;
    push: (href: string, options?: { scroll?: boolean }) => void;
    replace: (href: string, options?: { scroll?: boolean }) => void;
  },
  storeSlug: string,
  opts?: RunStoreCartBackNavigationOptions
): void {
  const slug = storeSlug.trim();
  if (!slug) return;

  const pathname =
    opts?.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : `${storeMenuHrefFromSlug(slug)}/cart`);
  const search =
    opts?.search ?? (typeof window !== "undefined" ? window.location.search : "");

  const entryContext = readNavigationEntryContext(slug);
  const resolution = resolveDibayBackTarget({
    currentPathname: pathname,
    currentSearch: search,
    storeSlug: slug,
    entryContext,
    overlayOpen: opts?.overlayOpen === true,
  });

  if (resolution.action === "CLOSE") {
    opts?.onCloseOverlay?.();
    return;
  }

  runDibayBackResolution(router, resolution, opts?.animatedBack ?? null);
}
