/**
 * D2 2-d-1 (Owner 「둘 다 승인」 2026-11-19) — 배지 1회의 종 알림 읽기 3번 → 1번.
 *
 * 이전: 같은 「안 읽은 알림」(user_id · unread=true · read_at null)을
 *   ① 부재중 통화 행(`loadOrphanMissedCallFacts`) ② 분류별 COUNT RPC(`countNotificationEventsBadge`)
 *   ③ 종 설명 행(`loadBellExplainUnreadEventRows`, 상한 2,000) 으로 따로 읽었다.
 * 지금: ③ 이 상한보다 적게 왔으면 = 전부 읽었으므로 ①·② 를 같은 행에서 같은 함수로 계산한다.
 * 상한에 닿으면(잘렸을 수 있음) null → 호출부가 ①·② 를 이전처럼 따로 읽는다.
 * 근거: 운영 11-19 1인 안 읽은 알림 최대 230건(상한 2,000).
 */
import { countNotificationEventsBadgeFromRows } from "@/lib/notifications/core/notification-event-repository";
import type { NotificationBadgeCount } from "@/lib/notifications/core/notification-event-types";
import type { BellExplainEventRow } from "@/lib/notifications/bell-explain-matrix";
import {
  aggregateOrphanMissedCallFacts,
  type OrphanMissedCallFacts,
} from "@/lib/notifications/load-orphan-missed-call-facts";

export type BellBadgeFactsFromRows = {
  missed: OrphanMissedCallFacts;
  categoryCounts: NotificationBadgeCount;
};

export function deriveBellBadgeFactsFromRows(
  rows: ReadonlyArray<BellExplainEventRow>,
  loadLimit: number
): BellBadgeFactsFromRows | null {
  if (rows.length >= loadLimit) return null;
  return {
    missed: aggregateOrphanMissedCallFacts(rows.filter((r) => r.category === "missed_call")),
    categoryCounts: countNotificationEventsBadgeFromRows(rows),
  };
}

/** 그림자 비교용 — 키 순서와 무관하게 같은 값인지 */
export function stableBellFactsKey(f: BellBadgeFactsFromRows): string {
  const byRoom = Object.keys(f.missed.byRoom)
    .sort()
    .map((k) => [k, f.missed.byRoom[k]]);
  const cc = f.categoryCounts as unknown as Record<string, unknown>;
  const counts = Object.keys(cc)
    .sort()
    .map((k) => [k, cc[k]]);
  return JSON.stringify({
    orphan: f.missed.orphan,
    orphanEventIds: [...f.missed.orphanEventIds].sort(),
    orphanCallIds: [...f.missed.orphanCallIds].sort(),
    byRoom,
    counts,
  });
}
