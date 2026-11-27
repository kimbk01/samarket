import { pickOwnerStoreFromMeList } from "@/lib/business/pick-owner-store-from-me-list";
import {
  parseStoreRowsFromMeStoresJson,
  peekMeStoresListClientCache,
} from "@/lib/me/fetch-me-stores-deduped";
import {
  shouldOwnerOrdersSkipCachePeek,
  type OwnerOrdersEntrySearchParams,
} from "@/lib/business/owner-orders-entry-policy";
import { peekOwnerStoreOrdersListCache } from "@/lib/delivery/owner/owner-store-orders-list-cache";
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

/** 허브·`me/stores` 캐시·주문 목록 캐시로 첫 페인트를 즉시 — 딥링크·`fresh_list` 진입은 peek 생략 */
export function buildOwnerOrdersViewInitialState(
  urlStoreId: string,
  entry: OwnerOrdersEntrySearchParams = {}
): OwnerOrdersViewLoadState {
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
  if (shouldOwnerOrdersSkipCachePeek(entry)) {
    return { kind: "loading" };
  }
  const ordersPeek = peekOwnerStoreOrdersListCache(store.id);
  if (!ordersPeek) {
    return { kind: "loading" };
  }
  return {
    kind: "ok",
    storeId: store.id,
    /** 언어 재감사 2026-11-27: 매장명이 없으면 빈 값 — 채팅 패널 머리는 화면 언어 키로 대체 */
    storeName: String(store.store_name ?? ""),
    orders: ordersPeek.orders,
  };
}
