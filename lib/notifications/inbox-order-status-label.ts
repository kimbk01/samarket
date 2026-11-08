import type { AppLanguageCode } from "@/lib/i18n/config";
import { normalizeStoreOrderCancelKind, orderStatusName } from "@/lib/stores/store-order-process-model";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";

/** 인박스 commerce 주문 카드 — 상태 칩 = 4단계 정본 이름 (`store-order-process-model`) */
export function resolveInboxOrderStatusChip(
  orderStatus: unknown,
  language: AppLanguageCode,
  meta?: { fulfillment_type?: unknown; cancel_kind?: unknown } | null
): string | null {
  const status = typeof orderStatus === "string" ? orderStatus.trim() : "";
  if (!status) return null;
  if (status === "failed") return notifySafeT(language, "notif_order_status_failed");
  const fulfillment = typeof meta?.fulfillment_type === "string" ? meta.fulfillment_type : "local_delivery";
  const name = orderStatusName(status, fulfillment, language, normalizeStoreOrderCancelKind(meta?.cancel_kind));
  return name && name !== status ? name : null;
}

export function resolveInboxOrderMetaLine(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const store =
    typeof meta.store_display_name === "string" ? meta.store_display_name.trim() : "";
  const orderNo = typeof meta.order_no === "string" ? meta.order_no.trim() : "";
  if (store && orderNo) return `${store} · ${orderNo}`;
  if (store) return store;
  if (orderNo) return orderNo;
  return null;
}
