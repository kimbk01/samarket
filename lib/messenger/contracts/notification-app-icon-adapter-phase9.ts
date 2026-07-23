/**
 * Phase 9 — Notification event → App Icon contribution adapter.
 * Domain NotificationPort 가 OS Badge 를 직접 set 하면 FAIL.
 * unit = notificationEventCount only (Phase 8B LOCK).
 */
import {
  aggregateAppIconBadgeFromNotificationEvents,
  type AppIconAggregatorResult,
  type AppIconNotificationEventInput,
} from "@/lib/messenger/contracts/app-icon-aggregator-phase8b";
import type { MessengerNotificationEnvelope } from "@/lib/messenger/contracts/domain-notification-envelope-phase9";
import { PHASE9_NOTIFICATION_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-notification-envelope-phase9";
import { D1_2_APP_ICON_UNIT } from "@/lib/messenger/contracts/badge-unit-policy-phase8b";

export type Phase9NotificationEventForBadge = Readonly<{
  eventId: string;
  unread: boolean;
  readAt: string | null;
  chatDomain: AppIconNotificationEventInput["source"];
  /** Domain port 가 OS setter 호출했는지 — 항상 false 여야 함 */
  setsOsBadgeDirectly?: boolean;
}>;

/**
 * Envelope / event 목록 → App Icon count (notificationEventCount).
 * unreadRoomCount 합산 API 없음.
 */
export function adaptNotificationEventsToAppIconContribution(
  events: ReadonlyArray<Phase9NotificationEventForBadge>
): AppIconAggregatorResult {
  if (PHASE9_NOTIFICATION_PRODUCTION_WIRING) {
    throw new Error("dibay_phase9_app_icon_adapter_production_wiring_forbidden");
  }
  for (const e of events) {
    if (e.setsOsBadgeDirectly) {
      throw new Error("dibay_phase9_domain_notification_port_must_not_set_os_badge");
    }
  }
  const mapped: AppIconNotificationEventInput[] = events.map((e) => ({
    eventId: e.eventId,
    unread: e.unread,
    readAt: e.readAt,
    source: e.chatDomain,
  }));
  const result = aggregateAppIconBadgeFromNotificationEvents(mapped);
  if (result.unit !== D1_2_APP_ICON_UNIT) {
    throw new Error("dibay_phase9_app_icon_unit_must_be_notification_event_count");
  }
  if (result.setsOsBadge) {
    throw new Error("dibay_phase9_app_icon_adapter_must_not_set_os_badge");
  }
  return result;
}

export function envelopesToUnreadBadgeEvents(
  envelopes: ReadonlyArray<MessengerNotificationEnvelope>,
  opts?: { readEventIds?: ReadonlySet<string> }
): ReadonlyArray<Phase9NotificationEventForBadge> {
  const read = opts?.readEventIds ?? new Set<string>();
  return envelopes.map((env) => ({
    eventId: env.eventId,
    unread: !read.has(env.eventId),
    readAt: read.has(env.eventId) ? env.occurredAt : null,
    chatDomain: env.chatDomain,
    setsOsBadgeDirectly: false,
  }));
}
