import { pickOwnerStoreFromMeList } from "@/lib/business/pick-owner-store-from-me-list";
import {
  parseStoreRowsFromMeStoresJson,
  peekMeStoresListClientCache,
} from "@/lib/me/fetch-me-stores-deduped";
import { peekOwnerStoreOrdersListCache } from "@/lib/stores/owner-store-orders-list-cache";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";

export type OwnerOrdersViewLoadState =
  | { kind: "loading" }
  | { kind: "unauth" }
  | { kind: "config" }
  | { kind: "no_store" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      storeId: string;
      storeName: string;
      orders: OwnerStoreOrderListRow[];
    };

/** 허브·`me/stores` 캐시·주문 목록 캐시로 첫 페인트를 즉시 — 이후 `load({ silent: true })` 로 정합 */
export function buildOwnerOrdersViewInitialState(urlStoreId: string): OwnerOrdersViewLoadState {
  const peekStores = peekMeStoresListClientCache();
  if (!peekStores || peekStores.status !== 200) {
    return { kind: "loading" };
  }
  const stores = parseStoreRowsFromMeStoresJson(peekStores.json);
  if (!stores?.length) {
    return { kind: "loading" };
  }
  const store = pickOwnerStoreFromMeList(
    stores as { id: string; store_name?: string; slug?: string }[],
    urlStoreId
  );
  if (!store) {
    return { kind: "loading" };
  }
  const ordersPeek = peekOwnerStoreOrdersListCache(store.id);
  if (!ordersPeek) {
    return { kind: "loading" };
  }
  return {
    kind: "ok",
    storeId: store.id,
    storeName: String(store.store_name ?? "내 매장"),
    orders: ordersPeek.orders,
  };
}
