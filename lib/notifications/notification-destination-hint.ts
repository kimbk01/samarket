import type { AppLanguageCode } from "@/lib/i18n/config";
import { translateBy } from "@/lib/i18n/translate-by";
import type { MessageKey } from "@/lib/i18n/messages";
import { isNotificationOriginUnavailableFallback } from "@/lib/notifications/resolve-notification-inbox-href";

/**
 * Human-readable CTA destination for Notification Center rows.
 * Prefer exact origin labels; flag explicit origin-unavailable fallback.
 */
export function resolveNotificationDestinationHint(
  href: string | null | undefined,
  language: AppLanguageCode
): string {
  // 원래 동작: "ko" 가 아니면 영어
  const hint = (key: MessageKey) => translateBy(language, key, undefined, "en");
  const raw = String(href ?? "").trim();
  if (!raw) {
    return hint("notifications_dest_origin_unavailable");
  }
  if (isNotificationOriginUnavailableFallback(raw)) {
    return hint("notifications_dest_origin_unavailable_inbox");
  }

  let path = raw;
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      path = new URL(raw).pathname + new URL(raw).search;
    }
  } catch {
    path = raw;
  }
  const p = path.split("?")[0] ?? path;

  if (p.startsWith("/post/")) return hint("notifications_dest_trade_post");
  if (p.startsWith("/philife/")) return hint("notifications_dest_community_post");
  if (p.startsWith("/philife")) return hint("notifications_dest_community");
  if (p.includes("/community-messenger") && path.includes("call-logs")) {
    return hint("notifications_dest_missed_call_log");
  }
  if (p.includes("/community-messenger")) return hint("notifications_dest_chat_room");
  if (p.startsWith("/mypage/store-orders/") || p.startsWith("/my/store-orders/")) {
    return hint("notifications_dest_order_detail");
  }
  if (p.startsWith("/my/store-orders") || p.startsWith("/mypage/store-orders")) {
    return hint("notifications_dest_orders");
  }
  if (p === "/orders") {
    return /[?&]expand=[^&]/.test(path)
      ? hint("notifications_dest_order_detail")
      : hint("notifications_dest_orders");
  }
  if (p.startsWith("/stores/owner/orders")) return hint("notifications_dest_owner_orders");
  if (p.startsWith("/mypage/customer-center/notice/")) {
    return hint("notifications_dest_notice_original");
  }
  if (p.startsWith("/mypage/customer-center/system/")) {
    return hint("notifications_dest_system_notice");
  }
  if (p.startsWith("/mypage/customer-center/marketing/")) {
    return hint("notifications_dest_marketing");
  }
  if (p.startsWith("/mypage/customer-center/")) {
    return hint("notifications_dest_customer_center");
  }
  if (p.startsWith("/mypage/notices/")) return hint("notifications_dest_notice_detail");
  if (p.startsWith("/mypage/notices")) return hint("notifications_dest_notices");
  if (p.startsWith("/mypage/inbox") || p.startsWith("/mypage/inquiries")) {
    return hint("notifications_dest_inquiry");
  }
  if (p.startsWith("/my/offers")) return hint("notifications_dest_offers");
  if (p.startsWith("/market")) return hint("notifications_dest_market");
  if (p === "/notifications" || p.startsWith("/notifications")) {
    return hint("notifications_dest_origin_unavailable_inbox");
  }
  return hint("notifications_dest_origin");
}
