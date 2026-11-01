/**
 * 알림 최종 설계 §2-3 (Owner 승인 2026-11-01) — 알림 줄의 「목적지 한 줄」.
 * 저장된 최종 목적지(경로)만 보고 고른다. 목적지 판정은 바꾸지 않는다.
 */
import type { MessageKey } from "@/lib/i18n/messages";

function pathOf(href: string): { path: string; query: string } {
  let raw = href.trim();
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const u = new URL(raw);
      raw = u.pathname + u.search;
    }
  } catch {
    /* keep raw */
  }
  const q = raw.indexOf("?");
  return q >= 0 ? { path: raw.slice(0, q), query: raw.slice(q + 1) } : { path: raw, query: "" };
}

export function resolveNotificationDestinationHintKey(href: string | null | undefined): MessageKey | null {
  const raw = String(href ?? "").trim();
  if (!raw) return null;
  const { path: p, query } = pathOf(raw);
  if (p.startsWith("/mypage/customer-center/notice") || p.startsWith("/mypage/notices")) return "notif_dest_hint_notice";
  if (p.startsWith("/mypage/customer-center/system")) return "notif_dest_hint_system";
  if (p.startsWith("/mypage/customer-center/update")) return "notif_dest_hint_app_release";
  if (p.startsWith("/mypage/app-updates")) return "notif_dest_hint_app_release";
  if (p.startsWith("/mypage/customer-center/marketing") || p.startsWith("/events")) return "notif_dest_hint_event";
  if (p.startsWith("/mypage/reports")) return "notif_dest_hint_reports";
  if (p.startsWith("/support/cases") || p.startsWith("/mypage/support-history")) return "notif_dest_hint_support";
  if (p.startsWith("/mypage/inquiries") || p.startsWith("/mypage/inbox") || p.startsWith("/notifications/notes")) {
    return "notif_dest_hint_inquiry";
  }
  if (p === "/orders" || p.startsWith("/orders/") || p.startsWith("/mypage/store-orders") || p.startsWith("/my/store-orders")) {
    return "notif_dest_hint_orders";
  }
  if (p.startsWith("/mypage/points")) return "notif_dest_hint_points";
  if (p.startsWith("/community-messenger") && /(^|&)section=friends(&|$)/.test(query)) return "notif_dest_hint_friends";
  if (p.startsWith("/community-messenger")) return "notif_dest_hint_chat";
  if (p.startsWith("/community/posts") || p.startsWith("/philife/")) return "notif_dest_hint_post";
  if (p.startsWith("/post/") || p.startsWith("/market") || p.startsWith("/my/offers") || p.startsWith("/mypage/products")) {
    return "notif_dest_hint_trade";
  }
  if (p.startsWith("/notifications/")) return "notif_dest_hint_detail";
  return null;
}
