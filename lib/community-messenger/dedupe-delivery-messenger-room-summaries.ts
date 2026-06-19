/**
 * 배달·주문 메신저 목록 dedupe — 동일 주문 1행.
 */
import {
  deliveryDirectKeyIsCanonicalStoreOrder,
  deliveryMessengerListCanonicalKey,
} from "@/lib/community-messenger/delivery-list-canonical-key";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function lastMessageMs(room: CommunityMessengerRoomSummary): number {
  const ms = new Date(room.lastMessageAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function preferDeliverySummary(
  a: CommunityMessengerRoomSummary,
  b: CommunityMessengerRoomSummary
): CommunityMessengerRoomSummary {
  const aMs = lastMessageMs(a);
  const bMs = lastMessageMs(b);
  if (bMs !== aMs) return bMs > aMs ? b : a;

  const aCanonical = deliveryDirectKeyIsCanonicalStoreOrder(a.messengerDirectKey);
  const bCanonical = deliveryDirectKeyIsCanonicalStoreOrder(b.messengerDirectKey);
  if (aCanonical !== bCanonical) return bCanonical ? b : a;

  return a;
}

/** 배달 방 요약만 canonical key 기준 1행으로 줄인다(비배달 행 순서·위치 유지). */
export function dedupeDeliveryMessengerRoomSummaries(
  summaries: CommunityMessengerRoomSummary[]
): CommunityMessengerRoomSummary[] {
  const deliveryByKey = new Map<string, CommunityMessengerRoomSummary>();
  for (const s of summaries) {
    const key = deliveryMessengerListCanonicalKey(s);
    if (!key) continue;
    const prev = deliveryByKey.get(key);
    deliveryByKey.set(key, prev ? preferDeliverySummary(prev, s) : s);
  }

  const emittedKeys = new Set<string>();
  const out: CommunityMessengerRoomSummary[] = [];
  for (const s of summaries) {
    const key = deliveryMessengerListCanonicalKey(s);
    if (!key) {
      out.push(s);
      continue;
    }
    if (emittedKeys.has(key)) continue;
    emittedKeys.add(key);
    out.push(deliveryByKey.get(key) ?? s);
  }
  return out;
}
