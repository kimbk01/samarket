"use client";

/**
 * CUT 2B — after STORE route commits, push pending PRODUCT child once.
 * Route-commit authority (useLayoutEffect on store menu root) — no setTimeout.
 */

import { useLayoutEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { STORE_DETAIL_FOCUS_PRODUCT_QUERY } from "@/lib/dibay/store-detail-href";
import {
  clearDeliveryStoreProductPending,
  consumeDeliveryStoreProductPending,
  peekDeliveryStoreProductPending,
} from "@/lib/navigation/delivery-store-product-pending";
import {
  isStoreProductDetailConsumerPath,
  isStoreSlugOrderMenuRoot,
} from "@/lib/stores/store-consumer-route";

export function DeliveryStoreProductChildCommit({ storeSlug }: { storeSlug: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const pushedTxRef = useRef<string | null>(null);
  const slug = storeSlug.trim();

  useLayoutEffect(() => {
    if (!slug) return;

    const path = pathname.split("?")[0] ?? "";
    if (isStoreProductDetailConsumerPath(path)) {
      // Already on product page — drop stale pending for this store
      clearDeliveryStoreProductPending(slug);
      return;
    }

    if (!isStoreSlugOrderMenuRoot(path, slug)) {
      return;
    }

    const focusInUrl = searchParams.get(STORE_DETAIL_FOCUS_PRODUCT_QUERY)?.trim();
    if (focusInUrl) {
      // Child already present as focus query (e.g. deep link) — clear pending
      clearDeliveryStoreProductPending(slug);
      return;
    }

    const pending = peekDeliveryStoreProductPending(slug);
    if (!pending) return;
    if (pushedTxRef.current === pending.transactionId) return;

    const consumed = consumeDeliveryStoreProductPending(slug);
    if (!consumed) return;
    pushedTxRef.current = consumed.transactionId;
    router.push(consumed.productHref, { scroll: false });
  }, [pathname, router, searchParams, slug]);

  // Leave store tree without consuming → clear pending (interrupt safety)
  useLayoutEffect(() => {
    return () => {
      const pending = peekDeliveryStoreProductPending(slug);
      if (!pending) return;
      if (typeof window === "undefined") return;
      const path = window.location.pathname.split("?")[0] ?? "";
      const stillOnStore =
        isStoreSlugOrderMenuRoot(path, slug) ||
        path.startsWith(`/stores/${encodeURIComponent(slug)}/`) ||
        path.startsWith(`/stores/${slug}/`);
      if (!stillOnStore) {
        clearDeliveryStoreProductPending(slug);
      }
    };
  }, [slug]);

  return null;
}
