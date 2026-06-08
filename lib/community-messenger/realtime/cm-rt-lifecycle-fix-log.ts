/**
 * 홈 Realtime(meta / rooms-in) 생명주기 완화 — 관측 전용.
 * `docs/messenger-realtime-policy.md` 표와 `MESSENGER_HOME_REALTIME_DEFERRED_PHYSICAL_STOP_GRACE_MS` 정합.
 */

import { isDebugMessengerEnabled } from "@/lib/community-messenger/debug/is-debug-messenger-enabled";

export type CmRtLifecycleFixAction = "reuse" | "create";

export function logCmRtLifecycleFix(payload: {
  action: CmRtLifecycleFixAction;
  channelName: string;
  reason: string;
  same_fingerprint?: boolean;
  had_existing_subscription?: boolean;
  grace_ms?: number | null;
  active_count?: number | null;
  listener_count?: number | null;
}): void {
  if (!isDebugMessengerEnabled()) return;
  try {
    const pathname = typeof window !== "undefined" ? window.location.pathname : null;
    // eslint-disable-next-line no-console -- dev-only churn diagnosis
    console.warn("[cm-rt-lifecycle-fix]", {
      pathname,
      channelName: payload.channelName,
      action: payload.action,
      reason: payload.reason,
      same_fingerprint: payload.same_fingerprint ?? null,
      had_existing_subscription: payload.had_existing_subscription ?? null,
      grace_ms: payload.grace_ms ?? null,
      active_count: payload.active_count ?? null,
      listener_count: payload.listener_count ?? null,
    });
  } catch {
    /* ignore */
  }
}
