import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import type { StoreOrderTabId } from "@/lib/business/store-orders-tab";
import { notifyOwnerAdminUrlSearchChanged } from "@/lib/business/use-owner-admin-url-search-params";

/**
 * 주문 카드 펼치기·접기 — Next `router.replace` 대신 history API.
 * DO NOT: query 만 바꿀 때 App Router `useSearchParams` Suspense 가 리마운트되며
 * 펼침·버튼이 먹통이 될 수 있다.
 */
export function replaceOwnerOrdersUrlQuery(params: {
  storeId: string;
  tab: StoreOrderTabId;
  orderId?: string;
  chatOrderId?: string;
  /** 날짜 필터 — 생략하면 지금 주소의 `from`·`to` 유지, null 이면 지움 */
  dateFrom?: string | null;
  dateTo?: string | null;
}): void {
  if (typeof window === "undefined") return;
  const current = new URLSearchParams(window.location.search);
  const href = buildStoreOrdersHref({
    storeId: params.storeId,
    tab: params.tab,
    orderId: params.orderId,
    chatOrderId: params.chatOrderId,
    dateFrom: params.dateFrom === undefined ? current.get("from") : params.dateFrom,
    dateTo: params.dateTo === undefined ? current.get("to") : params.dateTo,
  });
  window.history.replaceState(window.history.state, "", href);
  notifyOwnerAdminUrlSearchChanged();
}
