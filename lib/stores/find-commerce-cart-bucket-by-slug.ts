import type {
  StoreCommerceCartBucket,
  StoreCommerceCartSnapshotV2,
} from "@/lib/stores/store-commerce-cart-types";

export function findCommerceCartBucketBySlug(
  snapshot: StoreCommerceCartSnapshotV2 | null | undefined,
  storeSlug: string
): StoreCommerceCartBucket | null {
  if (!snapshot?.carts) return null;
  const sk = storeSlug.trim().toLowerCase();
  if (!sk) return null;
  for (const bucket of Object.values(snapshot.carts)) {
    if (String(bucket.storeSlug ?? "").trim().toLowerCase() === sk) return bucket;
  }
  return null;
}
