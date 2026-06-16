"use client";

import type { CallConsumedReason } from "@/lib/community-messenger/incoming-call-state";
import {
  isDibayCallConsumed,
  markCallConsumedFromNativeHydrate,
} from "@/lib/community-messenger/incoming-call-state";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import { getNativeIncomingCallPlugin } from "@/lib/push/native/push-route-native-bridge";

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
    const plugin = await getNativeIncomingCallPlugin();
    if (!plugin?.markCallConsumed) return;
    try {
      await plugin.markCallConsumed({ sessionId: sid, reason });
    } catch {
      /* best-effort */
    }
  })();
}

/** Native tombstone → Web in-memory consumed (no native re-sync). */
export async function hydrateDibayCallConsumedFromNative(): Promise<number> {
  const plugin = await getNativeIncomingCallPlugin();
  if (!plugin?.listConsumedCallIds) return 0;
  try {
    const result = await plugin.listConsumedCallIds();
    let count = 0;
    for (const item of result.items ?? []) {
      const sid = item.sessionId?.trim();
      if (!sid) continue;
      if (isDibayCallConsumed(sid)) continue;
      markCallConsumedFromNativeHydrate(sid, mapNativeConsumedReason(item.reason));
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
  const plugin = await getNativeIncomingCallPlugin();
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
  const plugin = await getNativeIncomingCallPlugin();
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
