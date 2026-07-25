import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import type { MessengerHubBadgeResyncReason } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { commitNotificationEventReadFact } from "@/lib/notifications/projection-authority";
import { requestNotificationBadgeCountResync } from "@/lib/notifications/notification-badge-count-store";

/**
 * notification_events 읽음 mutation 이후 UI 배지 단일 진입점 (Reconcile).
 * Domain badge-count authority resync (Hub projection 축은 Authority 경유).
 *
 * P0-3 LOCK:
 * - Surface(Hub/Bell/App Icon) 현재 값을 다시 읽어 Projection input 으로 재조립하지 않는다.
 * - Optimistic read 는 aggregate surface 숫자가 아니라 event fact 로만 Authority 에 입력한다.
 * - ACK 성공 후에만 fact commit; baseline(complete snapshot) 없으면 commit 하지 않고 resync 에 맡긴다.
 *
 * P1-a LOCK:
 * - `requestMessengerHubBadgeResync` 가 이미 badge-count resync 를 포함하므로
 *   여기서 `requestNotificationBadgeCountResync` 를 한 번 더 호출하지 않는다.
 */
export function resyncBadgesAfterNotificationEventsRead(reason: MessengerHubBadgeResyncReason): void {
  requestMessengerHubBadgeResync(reason);
}

/** Monotonic sequence so same-ms event identities never collide. */
let eventFactSeq = 0;
function nextEventFactSeq(): number {
  eventFactSeq += 1;
  return eventFactSeq;
}

/**
 * tier1 종 모두 읽음 (admin/notice inbox) — Bell adminNotice 만 0.
 * App Icon / CM / Trade / Order 는 불변 (event fact = admin_notice_absolute).
 */
export function applyTier1InboxMarkAllReadOptimistic(): void {
  const now = Date.now();
  const committed = commitNotificationEventReadFact({
    fact: { kind: "admin_notice_absolute", absolute: 0 },
    eventIdentity: `tier1_mark_all:${now}:${nextEventFactSeq()}`,
    eventVersion: now,
    source: "tier1_mark_all",
  });
  if (!committed) {
    requestNotificationBadgeCountResync("optimistic_admin_baseline_missing");
  }
}

/**
 * 통화목록(call_logs) 부재중 전체 읽음 — orphan missed_call 만 0.
 * Room-bound missed 는 CM room fact 영역이라 이 경로에서 건드리지 않는다(resync 로 정합).
 */
export function applyCallLogsOrphanMissedReadFact(): void {
  const now = Date.now();
  const committed = commitNotificationEventReadFact({
    fact: { kind: "orphan_missed_absolute", absolute: 0 },
    eventIdentity: `missed_call_read:call_logs:${now}:${nextEventFactSeq()}`,
    eventVersion: now,
    source: "call_logs_viewed",
    scope: "call_logs",
  });
  if (!committed) {
    requestNotificationBadgeCountResync("optimistic_missed_baseline_missing");
  }
}
