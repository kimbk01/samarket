"use client";

import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { cmStrictEffectRunProbe } from "@/lib/community-messenger/room/cm-bootstrap-scheduling";
import { isDebugMessengerEnabled } from "@/lib/community-messenger/debug/is-debug-messenger-enabled";

type IncomingCallSub = ReturnType<typeof subscribeWithRetry>;

type HolderRow = {
  refcount: number;
  sub: IncomingCallSub;
  channelName: string;
};

const holderByUserId = new Map<string, HolderRow>();

function logCmRtSubscriptionStable(payload: {
  channelName: string;
  action: "create" | "reuse" | "release";
  deduped: boolean;
  activeCount: number;
  strict_double_run_detected: boolean;
}): void {
  if (!isDebugMessengerEnabled()) return;
  // eslint-disable-next-line no-console -- dev subscription stability
  console.log("[cm-rt-subscription-stable]", payload);
}

export type AcquireIncomingCallRealtimeArgs = Parameters<typeof subscribeWithRetry>[0];

/**
 * 전역 incoming-call Realtime — StrictMode·다중 마운트에서 동일 userId 채널 1개만 유지.
 */
export function acquireIncomingCallRealtimeSubscription(
  args: AcquireIncomingCallRealtimeArgs
): IncomingCallSub {
  const userId = args.name.split(":").pop()?.trim() ?? "";
  const channelName = args.name;
  const existing = userId ? holderByUserId.get(userId) : undefined;
  if (existing) {
    existing.refcount += 1;
    logCmRtSubscriptionStable({
      channelName,
      action: "reuse",
      deduped: true,
      activeCount: existing.refcount,
      strict_double_run_detected: process.env.NODE_ENV === "development",
    });
    return {
      channel: existing.sub.channel,
      markSignal: existing.sub.markSignal,
      stop: () => {
        releaseIncomingCallRealtimeSubscription(userId);
      },
    };
  }

  const sub = subscribeWithRetry(args);
  if (userId) {
    holderByUserId.set(userId, { refcount: 1, sub, channelName });
  }
  logCmRtSubscriptionStable({
    channelName,
    action: "create",
    deduped: false,
    activeCount: 1,
    strict_double_run_detected: process.env.NODE_ENV === "development",
  });
  cmStrictEffectRunProbe("incoming_call_realtime_holder", userId);
  return {
    channel: sub.channel,
    markSignal: sub.markSignal,
    stop: () => {
      if (userId) releaseIncomingCallRealtimeSubscription(userId);
      else sub.stop();
    },
  };
}

export function releaseIncomingCallRealtimeSubscription(userId: string): void {
  const id = userId.trim();
  if (!id) return;
  const row = holderByUserId.get(id);
  if (!row) return;
  row.refcount = Math.max(0, row.refcount - 1);
  logCmRtSubscriptionStable({
    channelName: row.channelName,
    action: "release",
    deduped: row.refcount > 0,
    activeCount: row.refcount,
    strict_double_run_detected: false,
  });
  if (row.refcount > 0) return;
  holderByUserId.delete(id);
  row.sub.stop();
}
