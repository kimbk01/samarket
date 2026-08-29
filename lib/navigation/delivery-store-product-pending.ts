/**
 * CUT 2B — pending PRODUCT child after STORE route has committed.
 *
 * NOT setTimeout navigation. Stage-2 push runs from store route layout effect
 * after pathname is the store menu root (route-commit authority).
 */

import { buildStoreDetailHref, storeDetailHrefFromSlug } from "@/lib/dibay/store-detail-href";
import { sanitizeDibayInternalHref } from "@/lib/navigation/dibay-entry-context";

export type DeliveryStoreProductChildMode = "focusProduct" | "productPage";

export type DeliveryStoreProductPending = {
  storeSlug: string;
  productId: string;
  childMode: DeliveryStoreProductChildMode;
  productHref: string;
  transactionId: string;
  createdAt: number;
};

const PENDING_TTL_MS = 8_000;
const SS_KEY = "dibay:delivery-store-product-pending:v1";

let memoryPending: DeliveryStoreProductPending | null = null;

function readRaw(): DeliveryStoreProductPending | null {
  if (memoryPending) return memoryPending;
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DeliveryStoreProductPending;
  } catch {
    return null;
  }
}

function writeRaw(pending: DeliveryStoreProductPending | null): void {
  memoryPending = pending;
  if (typeof sessionStorage === "undefined") return;
  try {
    if (!pending) {
      sessionStorage.removeItem(SS_KEY);
      return;
    }
    sessionStorage.setItem(SS_KEY, JSON.stringify(pending));
  } catch {
    /* quota */
  }
}

export function buildDeliveryStoreProductChildHref(
  storeSlug: string,
  productId: string,
  childMode: DeliveryStoreProductChildMode
): string {
  const slug = storeSlug.trim();
  const pid = productId.trim();
  if (childMode === "productPage") {
    return `${storeDetailHrefFromSlug(slug)}/p/${encodeURIComponent(pid)}`;
  }
  return buildStoreDetailHref(slug, pid);
}

export function armDeliveryStoreProductPending(input: {
  storeSlug: string;
  productId: string;
  childMode: DeliveryStoreProductChildMode;
  transactionId: string;
}): DeliveryStoreProductPending {
  const storeSlug = input.storeSlug.trim();
  const productId = input.productId.trim();
  const productHref =
    sanitizeDibayInternalHref(
      buildDeliveryStoreProductChildHref(storeSlug, productId, input.childMode)
    ) || buildDeliveryStoreProductChildHref(storeSlug, productId, input.childMode);
  const pending: DeliveryStoreProductPending = {
    storeSlug,
    productId,
    childMode: input.childMode,
    productHref,
    transactionId: input.transactionId,
    createdAt: Date.now(),
  };
  writeRaw(pending);
  return pending;
}

export function peekDeliveryStoreProductPending(
  storeSlug?: string,
  now = Date.now()
): DeliveryStoreProductPending | null {
  const pending = readRaw();
  if (!pending) return null;
  if (pending.createdAt + PENDING_TTL_MS < now) {
    writeRaw(null);
    return null;
  }
  if (storeSlug && pending.storeSlug.trim().toLowerCase() !== storeSlug.trim().toLowerCase()) {
    return null;
  }
  return pending;
}

/** Consume once for stage-2 push. */
export function consumeDeliveryStoreProductPending(
  storeSlug: string,
  now = Date.now()
): DeliveryStoreProductPending | null {
  const pending = peekDeliveryStoreProductPending(storeSlug, now);
  if (!pending) return null;
  writeRaw(null);
  return pending;
}

export function clearDeliveryStoreProductPending(storeSlug?: string): void {
  if (!storeSlug) {
    writeRaw(null);
    return;
  }
  const pending = readRaw();
  if (!pending) return;
  if (pending.storeSlug.trim().toLowerCase() === storeSlug.trim().toLowerCase()) {
    writeRaw(null);
  }
}

export function resetDeliveryStoreProductPendingForTests(): void {
  writeRaw(null);
}
