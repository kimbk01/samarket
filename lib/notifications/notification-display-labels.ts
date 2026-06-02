import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";

/** 인앱 알림 목록 UI용 짧은 라벨 */
export function notificationTypeLabel(
  notificationType: string,
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string {
  switch (notificationType) {
    case "commerce":
      return notifySafeT(language, "notify_type_commerce");
    case "chat":
      return notifySafeT(language, "notify_type_chat");
    case "status":
      return notifySafeT(language, "notify_type_status");
    case "review":
      return notifySafeT(language, "notify_type_review");
    case "report":
      return notifySafeT(language, "notify_type_report");
    case "system":
      return notifySafeT(language, "notify_type_system");
    default:
      return notifySafeT(language, "notify_type_default");
  }
}

/** commerce 알림 meta.kind → 부가 라벨 (없으면 null) */
export function commerceMetaKindLabel(
  kind: unknown,
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string | null {
  if (typeof kind !== "string" || !kind) return null;
  const m: Record<string, MessageKey> = {
    store_order_created: "notify_kind_store_order_created",
    store_order_accept_reminder_30s: "notify_kind_store_order_created",
    store_order_accept_reminder_60s: "notify_kind_store_order_created",
    store_order_payment_completed_buyer: "notify_kind_store_order_payment_completed",
    store_order_payment_completed: "notify_kind_store_order_payment_completed",
    store_order_buyer_cancelled: "notify_kind_store_order_buyer_cancelled",
    store_order_refund_requested: "notify_kind_store_order_refund_requested",
    store_order_owner_status: "notify_kind_store_order_owner_status",
    store_order_payment_failed: "notify_kind_store_order_payment_failed",
    store_order_refund_approved: "notify_kind_store_order_refund_approved",
    store_order_auto_completed: "notify_kind_store_order_auto_completed",
    store_point_blocked: "notify_kind_store_point",
    store_point_deducted: "notify_kind_store_point",
    store_point_low: "notify_kind_store_point",
    store_point_charge_approved: "notify_kind_store_point",
    store_point_charge_rejected: "notify_kind_store_point",
    store_point_account_replied: "notify_kind_store_point",
  };
  const key = m[kind];
  return key ? notifySafeT(language, key) : null;
}
