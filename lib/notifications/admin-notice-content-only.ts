/**
 * 재감사 2026-11-01 B — 원본 화면이 없는 관리자 알림(운영 공지·시스템·채팅 신고 결과·제재 등).
 * 알림 자체가 내용이므로 알림센터 목록이 아니라 알림 상세 `/notifications/{id}` 로 연다.
 * 새 알림은 저장 시(notification-event-final-route → inbox-events-merge) 이 판정으로 목적지가 확정되고,
 * 같은 판정이 목적지 없이 저장된 옛 행(운영 2026-08 이전 admin_notice 등)도 읽을 때 상세로 보낸다.
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
