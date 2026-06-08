/**
 * 메신저 홈 메시지 INSERT 구독 안정화 진단 — 접두사 `[cm-rt-stable-sub]` 고정.
 */

import { cmDebugTailUserId, pushCmBrowserDebugEvent } from "@/lib/community-messenger/realtime/cm-browser-debug-buffer";
import { isDebugMessengerEnabled } from "@/lib/community-messenger/debug/is-debug-messenger-enabled";

export type CmRtStableSubTag =
  | "fingerprint_changed"
  | "channel_rebind_start"
  | "channel_rebind_done"
  | "missing_visible_trade_room_ids"
  | "home_realtime_refresh_schedule";

export function cmRtStableSubLog(tag: CmRtStableSubTag, payload: Record<string, unknown>): void {
  if (!isDebugMessengerEnabled()) return;
  console.info("[cm-rt-stable-sub]", tag, payload);
  if (tag === "fingerprint_changed") {
    const viewerUserId = typeof payload.viewerUserId === "string" ? payload.viewerUserId : null;
    const prevL = payload.prevFingerprintLength;
    const nextL = payload.nextFingerprintLength;
    const payloadForBuffer: Record<string, unknown> = { ...payload };
    delete payloadForBuffer.viewerUserId;
    pushCmBrowserDebugEvent({
      label: "fingerprint_changed",
      scope: null,
      channelName: null,
      reason: typeof payload.changedReason === "string" ? payload.changedReason : null,
      status: null,
      bodySnippet: null,
      payload: payloadForBuffer,
      stopSourceStack: null,
      fingerprint:
        typeof prevL === "number" && typeof nextL === "number" ? `${prevL}->${nextL}` : null,
      userIdTail: cmDebugTailUserId(viewerUserId),
    });
  }
}
