import { emptyCommerceCartV2 } from "@/lib/stores/store-commerce-cart-add-merge";
import { migrateLegacyCommerceCartSnapshot, sanitizeCommerceCartSnapshot } from "@/lib/stores/store-commerce-cart-expiry";
import { snapshotGeneration } from "@/lib/stores/store-commerce-cart-sync-guard";
import type {
  StoreCommerceCartBucket,
  StoreCommerceCartLine,
  StoreCommerceCartSnapshotV1,
  StoreCommerceCartSnapshotV2,
} from "@/lib/stores/store-commerce-cart-types";

export const STORE_COMMERCE_CART_STORAGE_KEY = "kasama_store_commerce_cart_v1";

let memoryFallback: StoreCommerceCartSnapshotV2 | null = null;
let storageAvailable = true;
/** 동일 탭 storage echo 방지(타 탭만 storage 이벤트 발생하지만 방어용) */
let suppressStorageSync = false;

function normalizeCommerceLineFlags(l: StoreCommerceCartLine): StoreCommerceCartLine {
  return {
    ...l,
    pickupAvailable: l.pickupAvailable !== false,
    localDeliveryAvailable: l.localDeliveryAvailable !== false,
    shippingAvailable: l.shippingAvailable !== false,
  };
}

function normalizeSnapshotV2(s: StoreCommerceCartSnapshotV2): StoreCommerceCartSnapshotV2 | null {
  if (s.v !== 2 || s.carts == null || typeof s.carts !== "object" || Array.isArray(s.carts)) {
    return null;
  }
  const carts: Record<string, StoreCommerceCartBucket> = {};
  for (const [k, b] of Object.entries(s.carts)) {
    if (!b || typeof b !== "object" || typeof b.storeId !== "string" || !Array.isArray(b.lines)) {
      continue;
    }
    carts[k] = {
      ...b,
      lines: (b.lines ?? []).map((ln) => normalizeCommerceLineFlags(ln)),
    };
  }
  return { v: 2, carts, touchedAtMs: s.touchedAtMs, generation: s.generation };
}

export function migrateCommerceCartToV2(raw: unknown): StoreCommerceCartSnapshotV2 | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v === 2) {
    return normalizeSnapshotV2(o as StoreCommerceCartSnapshotV2);
  }
  if (o.v === 1) {
    const v1 = raw as StoreCommerceCartSnapshotV1;
    if (typeof v1.storeId !== "string" || !Array.isArray(v1.lines)) return null;
    if (v1.lines.length === 0) return emptyCommerceCartV2();
    return normalizeSnapshotV2({
      v: 2,
      carts: {
        [v1.storeId]: {
          storeId: v1.storeId,
          storeSlug: v1.storeSlug,
          storeName: v1.storeName,
          lines: v1.lines,
        },
      },
    });
  }
  return null;
}

export type CommerceCartStorageRead = {
  snapshot: StoreCommerceCartSnapshotV2 | null;
  expired: boolean;
};

export function readCommerceCartFromStorage(): CommerceCartStorageRead {
  if (typeof window === "undefined") {
    return { snapshot: null, expired: false };
  }
  try {
    if (!storageAvailable) {
      return sanitizeCommerceCartSnapshot(
        memoryFallback ? migrateLegacyCommerceCartSnapshot(memoryFallback) : null
      );
    }
    const raw = localStorage.getItem(STORE_COMMERCE_CART_STORAGE_KEY);
    if (!raw) return { snapshot: null, expired: false };
    const migrated = migrateCommerceCartToV2(JSON.parse(raw) as unknown);
    if (!migrated) return { snapshot: null, expired: false };
    const legacy = migrateLegacyCommerceCartSnapshot(migrated);
    return sanitizeCommerceCartSnapshot(legacy);
  } catch {
    return { snapshot: null, expired: false };
  }
}

export function writeCommerceCartToStorage(snapshot: StoreCommerceCartSnapshotV2 | null): void {
  if (typeof window === "undefined") return;
  const toWrite =
    snapshot && Object.keys(snapshot.carts).length > 0 ? snapshot : null;

  memoryFallback = toWrite;

  try {
    if (!storageAvailable) return;
    suppressStorageSync = true;
    if (!toWrite) {
      localStorage.removeItem(STORE_COMMERCE_CART_STORAGE_KEY);
    } else {
      localStorage.setItem(STORE_COMMERCE_CART_STORAGE_KEY, JSON.stringify(toWrite));
    }
    queueMicrotask(() => {
      suppressStorageSync = false;
    });
  } catch {
    storageAvailable = false;
  }
}

export function isCommerceCartStorageSyncSuppressed(): boolean {
  return suppressStorageSync;
}

export function commerceCartStorageStorageKey(): string {
  return STORE_COMMERCE_CART_STORAGE_KEY;
}

export function readCommerceCartGenerationFromStorage(): number {
  const { snapshot } = readCommerceCartFromStorage();
  return snapshotGeneration(snapshot);
}
