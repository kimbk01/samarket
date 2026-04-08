import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";

/** 인앱 알림 목록 UI용 짧은 라벨 */
export function notificationTypeLabel(
  notificationType: string,
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string {
  switch (notificationType) {
    case "commerce":
      return translate(language, "notify_type_commerce");
    case "chat":
      return translate(language, "notify_type_chat");
    case "status":
      return translate(language, "notify_type_status");
    case "review":
      return translate(language, "notify_type_review");
    case "report":
      return translate(language, "notify_type_report");
    case "system":
      return translate(language, "notify_type_system");
    default:
      return notificationType || translate(language, "notify_type_default");
  }
}

/** commerce 알림 meta.kind → 부가 라벨 (없으면 null) */
export function commerceMetaKindLabel(
  kind: unknown,
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string | null {
  if (typeof kind !== "string" || !kind) return null;
  const m: Record<string, Parameters<typeof translate>[1]> = {
    store_order_created: "notify_kind_store_order_created",
    store_order_payment_completed: "notify_kind_store_order_payment_completed",
    store_order_buyer_cancelled: "notify_kind_store_order_buyer_cancelled",
    store_order_refund_requested: "notify_kind_store_order_refund_requested",
    store_order_owner_status: "notify_kind_store_order_owner_status",
    store_order_payment_failed: "notify_kind_store_order_payment_failed",
    store_order_refund_approved: "notify_kind_store_order_refund_approved",
    store_order_auto_completed: "notify_kind_store_order_auto_completed",
  };
  const key = m[kind];
  return key ? translate(language, key) : null;
}
