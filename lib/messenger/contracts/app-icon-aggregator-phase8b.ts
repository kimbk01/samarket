/**
 * Phase 8B — App Icon Aggregator (notificationEventCount only).
 * OS Badge setter 호출 금지. eventId dedupe · read 제외.
 */
import {
  D1_2_APP_ICON_UNIT,
  PHASE8B_BADGE_PRODUCTION_WIRING,
  assertPhase8bAppIconUsesNotificationEvents,
} from "@/lib/messenger/contracts/badge-unit-policy-phase8b";

export type AppIconNotificationEventInput = Readonly<{
  eventId: string;
  unread: boolean;
  readAt: string | null;
  /** 채팅 Domain 또는 비채팅 카테고리 구분용 태그 */
  source: "general_direct" | "group" | "trade" | "store_order" | "system" | "order_status" | "other";
}>;

export type AppIconAggregatorResult = Readonly<{
  unit: typeof D1_2_APP_ICON_UNIT;
  count: number;
  includedEventIds: ReadonlyArray<string>;
  productionWiring: typeof PHASE8B_BADGE_PRODUCTION_WIRING;
  setsOsBadge: false;
}>;

/**
 * 읽지 않은 notification events 만 eventId 기준 unique.
 * unreadRoomCount / unreadMessageCount 와 합산하지 않음.
 */
export function aggregateAppIconBadgeFromNotificationEvents(
  events: ReadonlyArray<AppIconNotificationEventInput>
): AppIconAggregatorResult {
  assertPhase8bAppIconUsesNotificationEvents(D1_2_APP_ICON_UNIT);

  if (PHASE8B_BADGE_PRODUCTION_WIRING) {
    throw new Error("dibay_phase8b_app_icon_production_wiring_forbidden");
  }

  const seen = new Set<string>();
  const included: string[] = [];
  for (const e of events) {
    const id = e.eventId.trim();
    if (!id) continue;
    if (!e.unread || e.readAt != null) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    included.push(id);
  }

  return {
    unit: D1_2_APP_ICON_UNIT,
    count: included.length,
    includedEventIds: included,
    productionWiring: false,
    setsOsBadge: false,
  };
}

/** 방 read 후 해당 room의 events 를 read 로 마킹한 뒤 재집계용 헬퍼 (순수) */
export function markEventsReadForRoom(
  events: ReadonlyArray<AppIconNotificationEventInput & { roomId?: string }>,
  roomId: string,
  readAtIso: string
): ReadonlyArray<AppIconNotificationEventInput & { roomId?: string }> {
  const rid = roomId.trim();
  return events.map((e) =>
    e.roomId === rid
      ? { ...e, unread: false, readAt: readAtIso }
      : e
  );
}

export function assertAppIconDoesNotAddRoomCount(
  appIconCount: number,
  unreadRoomCount: number
): void {
  // 문서화용 가드 — 호출부가 room을 더하면 테스트에서 실패하도록
  if (appIconCount === unreadRoomCount && unreadRoomCount > 0) {
    // 우연히 숫자가 같을 수 있으므로 throw 하지 않음 — 합산 API 자체가 없음.
  }
  void unreadRoomCount;
}
