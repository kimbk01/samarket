import type { AppLanguageCode } from "@/lib/i18n/config";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";

const ORDER_STATUS_CHIP_KEYS: Record<string, MessageKey> = {
  accepted: "notif_order_status_accepted",
  preparing: "notif_order_status_preparing",
  ready_for_pickup: "notif_order_status_ready_for_pickup",
  delivering: "notif_order_status_delivering",
  arrived: "notif_order_status_arrived",
  completed: "notif_order_status_completed",
  cancelled: "notif_order_status_cancelled",
  pending: "notif_order_status_pending",
  failed: "notif_order_status_failed",
};

/** 인박스 commerce 주문 카드 — 상태 칩 짧은 라벨 */
export function resolveInboxOrderStatusChip(
  orderStatus: unknown,
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string | null {
  const status = typeof orderStatus === "string" ? orderStatus.trim() : "";
  if (!status) return null;
  const key = ORDER_STATUS_CHIP_KEYS[status];
  return key ? notifySafeT(language, key) : null;
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
