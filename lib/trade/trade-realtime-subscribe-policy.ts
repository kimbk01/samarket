/**
 * 거래·메신저 홈 visible 방 Realtime 구독 상한 — 장시간 목록에서 channel 폭증 방지.
 * @see docs/trade-c2c-perf-baseline.md
 */

/** visible trade/order 행 기준 message room 구독 최대 개수 */
export const TRADE_VISIBLE_ROOM_REALTIME_SUBSCRIBE_MAX = 24;

/** 행이 viewport 밖으로 나간 뒤 unsubscribe 디바운스(ms) */
export const TRADE_ROOM_REALTIME_UNSUBSCRIBE_DEBOUNCE_MS = 450;

export function capVisibleRoomIdsForTradeRealtime(
  roomIds: readonly string[],
  max = TRADE_VISIBLE_ROOM_REALTIME_SUBSCRIBE_MAX
): string[] {
  const uniq = [...new Set(roomIds.map((id) => id.trim()).filter(Boolean))];
  if (uniq.length <= max) return uniq;
  return uniq.slice(0, max);
}
