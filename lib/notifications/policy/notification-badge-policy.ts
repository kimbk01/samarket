import {
  BADGE_COUNTABLE_CATEGORIES,
  type NotificationEventCategory,
} from "@/lib/notifications/core/notification-event-types";

export function isBadgeCountableCategory(category: NotificationEventCategory): boolean {
  return BADGE_COUNTABLE_CATEGORIES.has(category);
}
