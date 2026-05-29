import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import type { StoreOrderTabId } from "@/lib/business/store-orders-tab";

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
}): void {
  if (typeof window === "undefined") return;
  const href = buildStoreOrdersHref({
    storeId: params.storeId,
    tab: params.tab,
    orderId: params.orderId,
    chatOrderId: params.chatOrderId,
  });
  window.history.replaceState(window.history.state, "", href);
}
