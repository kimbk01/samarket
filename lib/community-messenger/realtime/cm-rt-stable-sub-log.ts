/**
 * 메신저 홈 메시지 INSERT 구독 안정화 진단 — 접두사 `[cm-rt-stable-sub]` 고정.
 */

export type CmRtStableSubTag =
  | "fingerprint_changed"
  | "channel_rebind_start"
  | "channel_rebind_done"
  | "missing_visible_trade_room_ids"
  | "home_realtime_refresh_schedule";

export function cmRtStableSubLog(tag: CmRtStableSubTag, payload: Record<string, unknown>): void {
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  console.info("[cm-rt-stable-sub]", tag, payload);
}
