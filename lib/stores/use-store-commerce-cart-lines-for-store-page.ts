"use client";

import { useMemo } from "react";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { findCommerceCartBucketBySlug } from "@/lib/stores/find-commerce-cart-bucket-by-slug";
import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";
import type { StoreCommerceCartSnapshotV2 } from "@/lib/stores/store-commerce-cart-types";

const EMPTY_LINES: StoreCommerceCartLine[] = [];

function normalizeStoreSlugForCart(raw: string): string {
  let s = String(raw ?? "").trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* noop */
  }
  return s.normalize("NFC").trim();
}

/**
 * 카트 페이지(`StoreCommerceCartPageClient`)와 동일:
 * slug → 버킷 → activeStoreId → getLinesForStoreId
 */
export function resolveStorePageCartLines(
  snapshot: StoreCommerceCartSnapshotV2 | null | undefined,
  hydrated: boolean,
  storeSlug: string,
  storeId: string | null | undefined,
  getLinesForStoreId: (storeId: string) => StoreCommerceCartLine[]
): { lines: StoreCommerceCartLine[]; activeStoreId: string | null } {
  if (!hydrated) return { lines: EMPTY_LINES, activeStoreId: null };

  const bucket = findCommerceCartBucketBySlug(snapshot, normalizeStoreSlugForCart(storeSlug));
  const activeStoreId =
    String(storeId ?? "").trim() || String(bucket?.storeId ?? "").trim() || null;
  if (!activeStoreId) return { lines: EMPTY_LINES, activeStoreId: null };

  return { lines: getLinesForStoreId(activeStoreId), activeStoreId };
}

export function useStoreCommerceCartLinesForStorePage(
  storeSlug: string,
  storeId: string | null | undefined
): {
  lines: StoreCommerceCartLine[];
  hydrated: boolean;
  activeStoreId: string | null;
} {
  const cart = useStoreCommerceCartOptional();

  return useMemo(() => {
    if (!cart) {
      return { lines: EMPTY_LINES, hydrated: false, activeStoreId: null };
    }
    const resolved = resolveStorePageCartLines(
      cart.snapshot,
      cart.hydrated,
      storeSlug,
      storeId,
      cart.getLinesForStoreId
    );
    return { ...resolved, hydrated: cart.hydrated };
  }, [cart, storeSlug, storeId]);
}
