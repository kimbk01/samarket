import type { AppLanguageCode } from "@/lib/i18n/config";
import { isNotificationOriginUnavailableFallback } from "@/lib/notifications/resolve-notification-inbox-href";

/**
 * Human-readable CTA destination for Notification Center rows.
 * Prefer exact origin labels; flag explicit origin-unavailable fallback.
 */
export function resolveNotificationDestinationHint(
  href: string | null | undefined,
  language: AppLanguageCode
): string {
  const ko = language === "ko";
  const raw = String(href ?? "").trim();
  if (!raw) {
    return ko ? "원본을 찾을 수 없음" : "Origin unavailable";
  }
  if (isNotificationOriginUnavailableFallback(raw)) {
    return ko ? "원본을 찾을 수 없음 · 알림함" : "Origin unavailable · Inbox";
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

  if (p.startsWith("/post/")) return ko ? "거래 글로 이동" : "Open trade post";
  if (p.startsWith("/philife/")) return ko ? "커뮤니티 글로 이동" : "Open community post";
  if (p.startsWith("/philife")) return ko ? "커뮤니티로 이동" : "Open community";
  if (p.includes("/community-messenger") && path.includes("call-logs")) {
    return ko ? "부재중 통화 기록으로 이동" : "Open missed-call log";
  }
  if (p.includes("/community-messenger")) return ko ? "채팅방으로 이동" : "Open chat room";
  if (p.startsWith("/mypage/store-orders/") || p.startsWith("/my/store-orders/")) {
    return ko ? "주문 상세로 이동" : "Open order detail";
  }
  if (p.startsWith("/my/store-orders") || p.startsWith("/mypage/store-orders")) {
    return ko ? "주문 목록으로 이동" : "Open orders";
  }
  if (p.startsWith("/stores/owner/orders")) return ko ? "사장님 주문으로 이동" : "Open owner orders";
  if (p.startsWith("/mypage/customer-center/notice/")) {
    return ko ? "공지 원문으로 이동" : "Open notice";
  }
  if (p.startsWith("/mypage/customer-center/system/")) {
    return ko ? "시스템 원문으로 이동" : "Open system notice";
  }
  if (p.startsWith("/mypage/customer-center/marketing/")) {
    return ko ? "마케팅 원문으로 이동" : "Open marketing";
  }
  if (p.startsWith("/mypage/customer-center/")) {
    return ko ? "고객센터로 이동" : "Open customer center";
  }
  if (p.startsWith("/mypage/notices/")) return ko ? "공지 상세로 이동" : "Open notice";
  if (p.startsWith("/mypage/notices")) return ko ? "공지 목록으로 이동" : "Open notices";
  if (p.startsWith("/mypage/inbox") || p.startsWith("/mypage/inquiries")) {
    return ko ? "문의로 이동" : "Open inquiry";
  }
  if (p.startsWith("/my/offers")) return ko ? "가격 제안으로 이동" : "Open offers";
  if (p.startsWith("/market")) return ko ? "거래 홈으로 이동" : "Open market";
  if (p === "/notifications" || p.startsWith("/notifications")) {
    return ko ? "원본을 찾을 수 없음 · 알림함" : "Origin unavailable · Inbox";
  }
  return ko ? "원본으로 이동" : "Open origin";
}
