/**
 * Community messenger message INSERT 구독 범위 진단 — 콘솔 prefix `[cm-rt-room-sub]` 고정.
 */

import { isDebugMessengerEnabled } from "@/lib/community-messenger/debug/is-debug-messenger-enabled";

let lastSubscribedMessageRoomIds: string[] = [];
/** 물리 `bindCommunityMessengerHomeRealtimeChannels` 호출 누적 — 채널 재바인딩 폭주 진단 */
let homeMessengerRealtimePhysicalBindCount = 0;

export function messengerRealtimeBumpHomeChannelPhysicalBindCount(): number {
  homeMessengerRealtimePhysicalBindCount += 1;
  return homeMessengerRealtimePhysicalBindCount;
}

export function messengerRealtimeGetHomeChannelPhysicalBindCount(): number {
  return homeMessengerRealtimePhysicalBindCount;
}

export function normalizeCmRealtimeSubscribeRoomId(id: string | null | undefined): string {
  return String(id ?? "")
    .trim()
    .toLowerCase();
}

export function messengerRealtimeRecordSubscribedMessageRoomIds(ids: readonly string[]): void {
  const next = [...new Set(ids.map((x) => normalizeCmRealtimeSubscribeRoomId(x)).filter(Boolean))].sort();
  lastSubscribedMessageRoomIds = next;
}

export function messengerRealtimeGetSubscribedMessageRoomIds(): readonly string[] {
  return lastSubscribedMessageRoomIds;
}

export function messengerRealtimeIsRoomSubscribedForMessages(roomId: string | null | undefined): boolean {
  const n = normalizeCmRealtimeSubscribeRoomId(roomId);
  if (!n) return false;
  return lastSubscribedMessageRoomIds.includes(n);
}

export function cmRtRoomSubLog(
  tag:
    | "trade_list_room_ids"
    | "subscribed_message_room_ids"
    | "missing_subscription_room_ids"
    | "realtime_message_received"
    | "realtime_message_not_subscribed"
    | "fingerprint_changed"
    | "channel_rebind_count",
  payload: Record<string, unknown>
): void {
  if (!isDebugMessengerEnabled()) return;
  console.info("[cm-rt-room-sub]", tag, payload);
}
