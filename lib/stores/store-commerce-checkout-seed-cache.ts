"use client";

import type { StoreCommerceCartBucket } from "@/lib/stores/store-commerce-cart-types";
import {
  deliveryPerfTraceLog,
  DELIVERY_PERF_TAG_CHECKOUT,
} from "@/lib/dibay/delivery-perf-trace";

const KEY_PREFIX = "dibay:store-commerce-checkout-seed:";
const TTL_MS = 45_000;

export type StoreCommerceCheckoutSeed = {
  storeId: string;
  storeSlug: string;
  storeName: string;
  itemCount: number;
  subtotalPhp: number;
  saved_at: number;
};

let checkoutNavMark = 0;

export function markStoreCommerceCheckoutNavigation(): void {
  checkoutNavMark = typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function getStoreCommerceCheckoutNavigationMark(): number {
  return checkoutNavMark;
}

function ssKey(slug: string): string {
  return KEY_PREFIX + slug.trim().toLowerCase();
}

export function writeStoreCommerceCheckoutSeed(bucket: StoreCommerceCartBucket): void {
  const slug = bucket.storeSlug.trim();
  if (!slug) return;
  let subtotalPhp = 0;
  let itemCount = 0;
  for (const line of bucket.lines) {
    const q = Math.max(0, Math.floor(line.qty) || 0);
    if (q <= 0) continue;
    itemCount += 1;
    subtotalPhp += Math.max(0, Number(line.unitPricePhp) || 0) * q;
  }
  const seed: StoreCommerceCheckoutSeed = {
    storeId: bucket.storeId,
    storeSlug: slug,
    storeName: bucket.storeName.trim() || slug,
    itemCount,
    subtotalPhp,
    saved_at: Date.now(),
  };
  try {
    sessionStorage.setItem(ssKey(slug), JSON.stringify(seed));
  } catch {
    /* quota */
  }
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_CHECKOUT, {
    event: "checkout_seed_write",
    store_id: seed.storeId,
    slug,
    item_count: itemCount,
  });
}

export function readStoreCommerceCheckoutSeed(slug: string): StoreCommerceCheckoutSeed | null {
  if (typeof sessionStorage === "undefined") return null;
  const s = slug.trim();
  if (!s) return null;
  try {
    const raw = sessionStorage.getItem(ssKey(s));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoreCommerceCheckoutSeed;
    if (!parsed?.storeSlug || parsed.saved_at + TTL_MS < Date.now()) {
      sessionStorage.removeItem(ssKey(s));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function resetStoreCommerceCheckoutSeedForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(KEY_PREFIX)) keys.push(k);
  }
  for (const k of keys) sessionStorage.removeItem(k);
  checkoutNavMark = 0;
}
