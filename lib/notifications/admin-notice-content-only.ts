/**
 * 재감사 2026-11-01 B — 원본 화면이 없는 관리자 알림(운영 공지·시스템·채팅 신고 결과·제재 등).
 * 알림 자체가 내용이므로 알림센터 목록이 아니라 알림 상세 `/notifications/{id}` 로 연다.
 * 종 행 링크(inbox-events-merge)와 푸시 링크(notify-push-dispatcher)가 같은 판정을 쓴다.
 */
import {
  isBareNotificationsCenterHref,
  isNotificationOriginUnavailableFallback,
} from "@/lib/notifications/resolve-notification-inbox-href";

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function isAdminNoticeContentOnlyEvent(input: {
  type: string | null | undefined;
  category?: string | null;
  /** display_payload.routeUrl (또는 link_url) — 비었거나 알림센터 자체일 때만 해당 */
  routeUrl?: string | null;
  roomId?: string | null;
}): boolean {
  const type = trim(input.type);
  const isAdminNotice =
    type === "admin_notice" || type === "admin_system" || trim(input.category) === "admin_notice";
  if (!isAdminNotice) return false;
  if (trim(input.roomId)) return false;
  const route = trim(input.routeUrl);
  return !route || isBareNotificationsCenterHref(route) || isNotificationOriginUnavailableFallback(route);
}
