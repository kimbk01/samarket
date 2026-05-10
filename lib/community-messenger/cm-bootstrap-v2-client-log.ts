"use client";

import { messengerVerboseTraceConsoleEnabled } from "@/lib/community-messenger/messenger-trace-console";

/** `[cm-bootstrap-v2-client]` — critical-first 스테이징(ms). 기준은 `markCmBootstrapV2ClientFlowAnchor()` 시각 */

let flowAnchorMs = 0;

export function markCmBootstrapV2ClientFlowAnchor(): void {
  if (typeof performance === "undefined") return;
  flowAnchorMs = performance.now();
}

function msFromAnchor(at: number): number {
  if (!flowAnchorMs || typeof performance === "undefined") return 0;
  return Math.max(0, Math.round(at - flowAnchorMs));
}

export function logCmBootstrapV2ClientFinalize(payload: {
  shellVisibleAt: number;
  criticalRequestStartAt: number;
  criticalResponseAt: number;
  roomListVisibleAt: number;
  deferredStartAt: number;
  deferredFinishAt: number;
  used_cached_snapshot: boolean;
  used_critical_payload: boolean;
}): void {
  if (!messengerVerboseTraceConsoleEnabled()) return;
  // eslint-disable-next-line no-console -- gated client bootstrap staging
  console.debug(
    "[cm-bootstrap-v2-client]",
    JSON.stringify({
      shell_visible_ms: msFromAnchor(payload.shellVisibleAt),
      critical_request_start_ms: msFromAnchor(payload.criticalRequestStartAt),
      critical_response_ms: msFromAnchor(payload.criticalResponseAt),
      room_list_visible_ms: msFromAnchor(payload.roomListVisibleAt),
      deferred_start_ms: msFromAnchor(payload.deferredStartAt),
      deferred_finish_ms: msFromAnchor(payload.deferredFinishAt),
      used_cached_snapshot: payload.used_cached_snapshot,
      used_critical_payload: payload.used_critical_payload,
    })
  );
}
