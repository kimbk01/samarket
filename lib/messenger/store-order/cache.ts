/**
 * StoreOrder CachePort — chat.store_order.* read-only / in-memory.
 */
import { STORE_ORDER_DOMAIN, type StoreOrderListItem } from "@/lib/messenger/store-order/types";

const NS = "chat.store_order";

export function buildStoreOrderCacheKey(input: { viewerUserId: string; generation: string }): string {
  const viewer = input.viewerUserId.trim();
  const generation = input.generation.trim() || "0";
  if (!viewer) throw new Error("dibay_store_order_cache_viewer_required");
  const key = `${NS}.snapshot.v1:${viewer}:${STORE_ORDER_DOMAIN}:${generation}`;
  assertStoreOrderCacheNamespace(key);
  return key;
}

function assertStoreOrderCacheNamespace(key: string): void {
  if (!key.startsWith(`${NS}.`)) throw new Error(`dibay_store_order_cache_namespace_forbidden:${key}`);
  if (
    key.startsWith("chat.general.") ||
    key.startsWith("chat.group.") ||
    key.startsWith("chat.trade.")
  ) {
    throw new Error("dibay_store_order_foreign_cache_forbidden");
  }
}

export class StoreOrderReadonlyMemoryCache {
  readonly domain = STORE_ORDER_DOMAIN;
  readonly namespacePrefix = NS;
  readonly readOnlyUntilCutover = true as const;
  private store = new Map<string, ReadonlyArray<StoreOrderListItem>>();

  seedForTest(key: string, rows: ReadonlyArray<StoreOrderListItem>): void {
    assertStoreOrderCacheNamespace(key);
    this.store.set(key, rows);
  }

  read(key: string): ReadonlyArray<StoreOrderListItem> | null {
    assertStoreOrderCacheNamespace(key);
    return this.store.get(key) ?? null;
  }

  writeForbidden(): never {
    throw new Error("dibay_store_order_cache_write_forbidden_until_phase6");
  }

  clearForTest(): void {
    this.store.clear();
  }
}

export const storeOrderMemoryCache = new StoreOrderReadonlyMemoryCache();
