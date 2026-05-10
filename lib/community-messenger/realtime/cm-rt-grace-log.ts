/**
 * 홈 meta / rooms-in **grace keepalive** 관측 — `docs/messenger-realtime-policy.md` 와
 * `MESSENGER_HOME_REALTIME_DEFERRED_PHYSICAL_STOP_GRACE_MS` 정합.
 */

import { recordCmRtWindowGraceAction } from "@/lib/community-messenger/realtime/cm-rt-window-metrics";

export type CmRtGraceAction = "defer_stop" | "cancel_stop" | "reuse_existing" | "final_stop";

export function logCmRtGrace(payload: {
  action: CmRtGraceAction;
  grace_ms: number | null;
  channelName: string;
  same_fingerprint?: boolean | null;
  had_existing_subscription?: boolean | null;
}): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "development") return;
  if (payload.action === "final_stop" || payload.action === "cancel_stop" || payload.action === "reuse_existing") {
    recordCmRtWindowGraceAction(payload.action);
  }
  try {
    const pathname = typeof window !== "undefined" ? window.location.pathname : null;
    // eslint-disable-next-line no-console -- dev-only grace keepalive diagnosis
    console.warn("[cm-rt-grace]", {
      pathname,
      action: payload.action,
      grace_ms: payload.grace_ms,
      channelName: payload.channelName,
      same_fingerprint: payload.same_fingerprint ?? null,
      had_existing_subscription: payload.had_existing_subscription ?? null,
    });
  } catch {
    /* ignore */
  }
}
