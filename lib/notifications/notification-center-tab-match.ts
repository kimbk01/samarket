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
  | "system";

/** @deprecated use NotificationCenterCategoryTab */
export type NotificationCenterMemberTab = NotificationCenterCategoryTab;

export type TabMatchRow = MemberNotificationDomainRow;

export function matchesNotificationCenterMemberTab(
  row: TabMatchRow,
  tab: NotificationCenterCategoryTab
): boolean {
  return classifyMemberNotificationDomain(row) === (tab as MemberNotificationDomain);
}
