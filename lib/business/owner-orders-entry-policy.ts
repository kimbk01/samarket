import { buildOwnerStoreOrderNotificationHref } from "@/lib/business/owner-store-order-notification-href";
import { buildStoreOrdersHref, type StoreOrderTabId } from "@/lib/business/store-orders-tab";

/** 대시보드·알림·하단 탭 → 주문 목록 진입 시 목록 캐시 peek·silent load 금지 힌트 */
export const OWNER_ORDERS_FRESH_LIST_PARAM = "fresh_list";
export const OWNER_ORDERS_FRESH_LIST_VALUE = "1";

export type OwnerOrdersEntrySearchParams = {
  orderId?: string | null;
  freshList?: string | null;
  ackOwnerNotifications?: string | null;
};

export function parseOwnerOrdersFreshList(raw: string | null | undefined): boolean {
  return (raw ?? "").trim() === OWNER_ORDERS_FRESH_LIST_VALUE;
}

export function shouldOwnerOrdersForceNetwork(params: OwnerOrdersEntrySearchParams): boolean {
  const oid = (params.orderId ?? "").trim();
  if (oid.length > 0) return true;
  if (parseOwnerOrdersFreshList(params.freshList)) return true;
  if ((params.ackOwnerNotifications ?? "").trim() === "1") return true;
  return false;
}

export function shouldOwnerOrdersSkipCachePeek(params: OwnerOrdersEntrySearchParams): boolean {
  return shouldOwnerOrdersForceNetwork(params);
}

export function buildOwnerOrdersEntryHref(params: {
  storeId: string;
  tab?: StoreOrderTabId;
  orderId?: string;
  chatOrderId?: string;
  ackOwnerNotifications?: boolean;
  freshList?: boolean;
  kind?: string | null;
  orderStatus?: string | null;
}): string {
  const storeId = params.storeId.trim();
  const orderId = params.orderId?.trim() ?? "";
  if (orderId && (params.kind != null || params.orderStatus != null || params.ackOwnerNotifications)) {
    return buildOwnerStoreOrderNotificationHref({
      storeId,
      orderId,
      kind: params.kind,
      orderStatus: params.orderStatus,
      ackOwnerNotifications: params.ackOwnerNotifications === true,
      freshList: params.freshList === true,
    });
  }
  return buildStoreOrdersHref({
    storeId,
    tab: params.tab,
    orderId: orderId || undefined,
    chatOrderId: params.chatOrderId,
    ackOwnerNotifications: params.ackOwnerNotifications,
    freshList: params.freshList,
  });
}

export function ownerOrdersEntrySearchParamsFromUrlSearchParams(
  searchParams: URLSearchParams | { get: (key: string) => string | null }
): OwnerOrdersEntrySearchParams {
  return {
    orderId: searchParams.get("order_id"),
    freshList: searchParams.get(OWNER_ORDERS_FRESH_LIST_PARAM),
    ackOwnerNotifications: searchParams.get("ack_owner_notifications"),
  };
}
