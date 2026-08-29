/**
 * CUT 3 — canonical Delivery cart navigation owner.
 * Cards/strips MUST NOT invent cart Back policy; they call this for intentional entry.
 */

import { commitDeliveryCartNavigationEntry } from "@/lib/navigation/dibay-navigation-context-store";
import { storeMenuHrefFromSlug } from "@/lib/navigation/dibay-entry-context";

type NavRouter = {
  push: (href: string, options?: { scroll?: boolean }) => void;
};

export type NavigateToDeliveryStoreCartInput = {
  storeSlug: string;
  storeId?: string | null;
  pathname?: string;
  search?: string;
};

function resolveLocation(pathname?: string, search?: string): { pathname: string; search: string } {
  if (pathname != null) {
    return { pathname, search: search ?? "" };
  }
  if (typeof window !== "undefined") {
    return { pathname: window.location.pathname, search: window.location.search };
  }
  return { pathname: "/stores", search: "" };
}

export function buildDeliveryStoreCartHref(storeSlug: string): string {
  return `${storeMenuHrefFromSlug(storeSlug)}/cart`;
}

/** Intentional STORE/PRODUCT → CART. */
export function navigateToDeliveryStoreCart(
  router: NavRouter,
  input: NavigateToDeliveryStoreCartInput
): void {
  const storeSlug = input.storeSlug.trim();
  if (!storeSlug) return;
  const loc = resolveLocation(input.pathname, input.search);
  commitDeliveryCartNavigationEntry({
    storeSlug,
    pathname: loc.pathname,
    search: loc.search,
    storeId: input.storeId ?? null,
  });
  router.push(buildDeliveryStoreCartHref(storeSlug), { scroll: false });
}
