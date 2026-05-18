import type { StoreCartAddResult } from "@/lib/stores/store-commerce-cart-types";
import type { StoreCartBucketSummary } from "@/contexts/StoreCommerceCartContext";

/** 다른 매장 장바구니 충돌 모달 표시용 */
export type StoreCartConflictExisting = {
  storeId: string;
  storeSlug: string;
  storeName: string;
  itemCount: number;
  subtotalPhp: number;
};

export type StoreCartConflictTarget = {
  storeId: string;
  storeSlug: string;
  storeName: string;
};

export function storeCartConflictExistingFromBlockedAdd(
  r: Extract<StoreCartAddResult, { ok: false; reason: "blocked_by_other_store" }>
): StoreCartConflictExisting {
  return {
    storeId: r.existingStoreId,
    storeSlug: r.existingStoreSlug,
    storeName: r.existingStoreName,
    itemCount: r.existingItemCount,
    subtotalPhp: r.existingSubtotalPhp,
  };
}

export function storeCartConflictExistingFromBucket(
  b: StoreCartBucketSummary
): StoreCartConflictExisting {
  return {
    storeId: b.storeId,
    storeSlug: b.storeSlug,
    storeName: b.storeName,
    itemCount: b.itemCount,
    subtotalPhp: b.subtotalPhp,
  };
}
