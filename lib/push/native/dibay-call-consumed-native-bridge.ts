"use client";

import type { CallConsumedReason } from "@/lib/community-messenger/incoming-call-state";
import { isDibayCallConsumed, markCallConsumedFromNativeHydrate } from "@/lib/community-messenger/incoming-call-state";
import { hydrateIncomingCallTerminalFromNative } from "@/lib/community-messenger/incoming-call/tombstone";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import {
  getNativeIncomingCallPlugin,
  getSyncNativeIncomingCallPlugin,
} from "@/lib/push/native/push-route-native-bridge";

function mapNativeConsumedReason(reason: string | null | undefined): CallConsumedReason {
  const r = (reason ?? "").trim().toLowerCase();
  switch (r) {
    case "accepted":
      return "accepted";
    case "declined":
    case "rejected":
      return "declined";
    case "missed":
      return "missed";
    case "ended":
      return "ended";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "ended";
  }
}

/** Web consumed/terminal → Android native ring + late FCM guard */
export function syncDibayCallConsumedToNative(
  sessionId: string,
  reason: CallConsumedReason | string = "consumed"
): void {
  const sid = sessionId.trim();
  if (!sid) return;
  void (async () => {
    const ref = await getNativeIncomingCallPlugin();
    const plugin = ref?.plugin;
    if (!plugin?.markCallConsumed) return;
    try {
      await plugin.markCallConsumed({ sessionId: sid, reason });
    } catch {
      /* best-effort */
    }
  })();
}

/** Poll·hydrate 수신 — FCM 없이 Web 이 ringing 을 먼저 알아도 native OS 벨 시작. */
export function startNativeIncomingRingtoneFireAndForget(sessionId: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  const plugin = getSyncNativeIncomingCallPlugin();
  if (plugin?.startIncomingRingtone) {
    void plugin.startIncomingRingtone({ sessionId: sid }).catch(() => {});
    return;
  }
  void (async () => {
    const ref = await getNativeIncomingCallPlugin();
    const asyncPlugin = ref?.plugin;
    if (!asyncPlugin?.startIncomingRingtone) return;
    try {
      await asyncPlugin.startIncomingRingtone({ sessionId: sid });
    } catch {
      /* best-effort */
    }
  })();
}

/** Terminal/stop — Android native OS ringtone 즉시 중지 (Web stop 과 병행). */
export function stopNativeIncomingRingtoneFireAndForget(sessionId?: string | null): void {
  const sid = sessionId?.trim() ?? "";
  const plugin = getSyncNativeIncomingCallPlugin();
  if (plugin?.stopIncomingRingtone) {
    void plugin.stopIncomingRingtone(sid ? { sessionId: sid } : {}).catch(() => {});
    return;
  }
  void (async () => {
    const ref = await getNativeIncomingCallPlugin();
    const asyncPlugin = ref?.plugin;
    if (!asyncPlugin?.stopIncomingRingtone) return;
    try {
      await asyncPlugin.stopIncomingRingtone(sid ? { sessionId: sid } : {});
    } catch {
      /* best-effort */
    }
  })();
}

/** Native tombstone → Web in-memory consumed (no native re-sync). */
export async function hydrateDibayCallConsumedFromNative(
  hardClearedAt?: Map<string, number>
): Promise<number> {
  const ref = await getNativeIncomingCallPlugin();
  const plugin = ref?.plugin;
  if (!plugin?.listConsumedCallIds) return 0;
  try {
    const result = await plugin.listConsumedCallIds();
    let count = 0;
    for (const item of result.items ?? []) {
      const sid = item.sessionId?.trim();
      if (!sid) continue;
      if (isDibayCallConsumed(sid)) continue;
      const reason = mapNativeConsumedReason(item.reason);
      if (hardClearedAt) {
        hydrateIncomingCallTerminalFromNative(sid, reason, hardClearedAt);
      } else {
        markCallConsumedFromNativeHydrate(sid, reason);
      }
      count += 1;
    }
    if (count > 0) {
      logDibayCall("native_consumed_hydrate", { count });
    }
    return count;
  } catch {
    return 0;
  }
}

/** GET/FCM optimistic insert 전 — Web + Native consumed tombstone 확인. */
export async function isCallConsumedIncludingNative(sessionId: string): Promise<boolean> {
  const sid = sessionId.trim();
  if (!sid) return false;
  if (isDibayCallConsumed(sid)) return true;
  const ref = await getNativeIncomingCallPlugin();
  const plugin = ref?.plugin;
  if (!plugin?.isCallConsumed) return false;
  try {
    const result = await plugin.isCallConsumed({ sessionId: sid });
    if (result.consumed) {
      markCallConsumedFromNativeHydrate(sid, mapNativeConsumedReason(result.reason));
      logDibayCall("incoming_ignored_consumed", {
        sessionId: sid,
        callId: sid,
        source: "native_store_check",
        reason: result.reason,
      });
      return true;
    }
  } catch {
    /* best-effort */
  }
  return false;
}

export type PendingTerminalEvent = { sessionId: string; status: string };

/** Drain native terminal queue into Web handlers (backup when inject missed React mount). */
export async function drainPendingTerminalEventsFromNative(): Promise<PendingTerminalEvent[]> {
  const ref = await getNativeIncomingCallPlugin();
  const plugin = ref?.plugin;
  if (!plugin?.drainPendingTerminalEvents) return [];
  try {
    const result = await plugin.drainPendingTerminalEvents();
    const out: PendingTerminalEvent[] = [];
    for (const item of result.items ?? []) {
      const sid = item.sessionId?.trim();
      if (!sid) continue;
      out.push({
        sessionId: sid,
        status: (item.status ?? "cancelled").trim().toLowerCase() || "cancelled",
      });
    }
    return out;
  } catch {
    return [];
  }
}
