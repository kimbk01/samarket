/**
 * Client/server-aligned category matching for Notification Center.
 * Authority: classifyMemberNotificationDomain (ONE EVENT → ONE DOMAIN).
 */
import {
  classifyMemberNotificationDomain,
  type MemberNotificationDomain,
  type MemberNotificationDomainRow,
} from "@/lib/notifications/member-notification-domain";

export type NotificationCenterCategoryTab =
  | "notice"
  | "trade"
  | "community"
  | "delivery"
  | "marketing"
  | "system"
  | "support"
  /** 알림 최종 설계 §2-2 — 운영 소식 = 공지 + 시스템 */
  | "ops";

/** @deprecated use NotificationCenterCategoryTab */
export type NotificationCenterMemberTab = NotificationCenterCategoryTab;

export type TabMatchRow = MemberNotificationDomainRow & {
  meta?: Record<string, unknown> | null;
  event_kind?: string | null;
};

export function matchesNotificationCenterMemberTab(
  row: TabMatchRow,
  tab: NotificationCenterCategoryTab
): boolean {
  // D-1: 탭 숫자도 탭 목록(classifyInboxRowMemberDomain)과 같은 kind 를 분류 입력으로 쓴다.
  const metaKind =
    row.meta_kind ??
    (row.event_kind || (typeof row.meta?.kind === "string" ? (row.meta.kind as string) : null));
  const domain = classifyMemberNotificationDomain({ ...row, meta_kind: metaKind });
  if (tab === "ops") return domain === "notice" || domain === "system";
  return domain === (tab as MemberNotificationDomain);
}
