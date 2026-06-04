import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import {
  ownerMobileOrdersTabForStatus,
  type OwnerMobileOrderTabId,
} from "@/lib/business/owner-mobile-orders-tab";

/** 매장 오너 commerce 알림 `meta.kind` → 모바일 주문 탭 (목록 필터·딥링크 단일 소스). */
export function ownerMobileTabForCommerceMetaKind(kind: string): OwnerMobileOrderTabId {
  const k = kind.trim();
  if (
    k === "store_order_created" ||
    k === "store_order_accept_reminder_30s" ||
    k === "store_order_accept_reminder_60s"
  ) {
    return "new";
  }
  if (k === "store_order_refund_requested" || k === "store_order_refund_approved") {
    return "cancelled";
  }
  if (k === "store_order_buyer_cancelled" || k === "store_order_payment_failed") {
    return "cancelled";
  }
  if (k === "store_order_payment_completed") {
    return "new";
  }
  return "new";
}

export function buildOwnerStoreOrderNotificationHref(params: {
  storeId: string;
  orderId: string;
  kind?: string | null;
  orderStatus?: string | null;
  ackOwnerNotifications?: boolean;
  freshList?: boolean;
}): string {
  const storeId = params.storeId.trim();
  const orderId = params.orderId.trim();
  const status = (params.orderStatus ?? "").trim();
  const tab: OwnerMobileOrderTabId = status
    ? ownerMobileOrdersTabForStatus(status)
    : ownerMobileTabForCommerceMetaKind(String(params.kind ?? ""));
  return buildStoreOrdersHref({
    storeId,
    orderId,
    tab,
    ackOwnerNotifications: params.ackOwnerNotifications === true,
    freshList: params.freshList === true || params.ackOwnerNotifications === true,
  });
}
