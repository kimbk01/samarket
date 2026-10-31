/**
 * C2 목적지 계약 (docs/audit/notification-system-ssot-hardlock-reaudit-2026-11-01.md §3 C2) —
 * 알림 이벤트의 최종 목적지는 **저장할 때 한 번** 정해 `display_payload.routeUrl` 에 둔다.
 *
 * - 계산은 새 해석기를 만들지 않고 종 목록이 쓰던 `resolveEventInboxLinkUrl` 그대로 쓴다
 *   → 종·전체 목록·앱 안 배너·푸시(`url`)가 같은 값을 읽는다.
 * - 알림센터 목록 자체(`/notifications`)는 목적지로 저장하지 않는다. 알림 자체가 내용이면 `/notifications/{id}`.
 * - 메신저·통화 종류는 파이프라인이 방·통화 경로를 이미 정해 저장하므로 손대지 않는다(통화 규정 범위 밖).
 */
import type { CreateNotificationEventInput } from "@/lib/notifications/core/notification-event-schema";
import { resolveEventInboxLinkUrl } from "@/lib/notifications/inbox-events-merge";

export const ROUTE_OWNED_BY_PIPELINE_TYPES: ReadonlySet<string> = new Set<string>([
  "chat_message",
  "group_message",
  "mention_message",
  "pin_message",
  "trade_message",
  "store_order_message",
  "missed_call",
  "incoming_call_signal",
]);

export function finalizeNotificationEventRoute(
  input: CreateNotificationEventInput
): { id: string; displayPayload: Record<string, unknown> } {
  const id = input.id?.trim() || globalThis.crypto.randomUUID();
  const displayPayload: Record<string, unknown> = { ...(input.displayPayload ?? {}) };
  if (ROUTE_OWNED_BY_PIPELINE_TYPES.has(String(input.type))) {
    return { id, displayPayload };
  }
  const finalRoute = resolveEventInboxLinkUrl({
    id,
    type: input.type,
    category: input.category,
    title: input.title,
    body: input.body,
    display_payload: displayPayload,
    read_at: null,
    created_at: new Date().toISOString(),
    dedupe_key: input.dedupeKey,
    room_id: input.roomId?.trim() || null,
  });
  if (finalRoute) displayPayload.routeUrl = finalRoute;
  return { id, displayPayload };
}
