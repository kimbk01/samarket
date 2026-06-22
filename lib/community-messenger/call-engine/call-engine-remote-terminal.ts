"use client";

import { dibayIncomingLaneStopRing } from "@/lib/community-messenger/call-lifecycle";
import { syncIncomingCallRing } from "@/lib/community-messenger/incoming-call/ring-owner";
import {
  markCallConsumed,
  type CallConsumedReason,
} from "@/lib/community-messenger/incoming-call-state";
import { dismissAllIncomingCallNotificationsFireAndForget } from "@/lib/push/native/dismiss-native-incoming-call-notification";
import {
  getSyncNativeIncomingCallPlugin,
} from "@/lib/push/native/push-route-native-bridge";
import { markCallEngineTerminalConsumed } from "@/lib/community-messenger/call-engine/call-engine-locks";
import { syncCallEngineStateFromSession } from "@/lib/community-messenger/call-engine/call-engine-state";
import { releaseCallEngineTerminalLocalState } from "@/lib/community-messenger/call-engine/call-engine-terminal-cleanup";
import type { CommunityMessengerCallSessionStatus } from "@/lib/community-messenger/types";
import { clearNativeIncomingSurface } from "@/lib/community-messenger/call-engine/call-engine-native-surface";

export type RemoteTerminalStatus = "ended" | "cancelled" | "rejected" | "missed" | "failed";
export type RemoteTerminalSource = "poll" | "hydrate" | "realtime" | "native" | "fcm";

export function mapIncomingTerminalSourceTag(sourceTag: string): RemoteTerminalSource {
  const tag = sourceTag.trim().toLowerCase();
  if (tag.includes("realtime")) return "realtime";
  if (tag.includes("fcm")) return "fcm";
  if (tag.includes("hydrate")) return "hydrate";
  if (tag.includes("native")) return "native";
  if (tag.includes("poll")) return "poll";
  return "poll";
}

export function mapRemoteTerminalToConsumedReason(status: RemoteTerminalStatus): CallConsumedReason {
  switch (status) {
    case "rejected":
      return "declined";
    case "missed":
      return "missed";
    case "ended":
      return "ended";
    case "failed":
      return "ended";
    case "cancelled":
    default:
      return "cancelled";
  }
}

export async function handleCallEngineRemoteTerminal(args: {
  callId: string;
  status: RemoteTerminalStatus;
  source: RemoteTerminalSource;
}): Promise<void> {
  const sid = args.callId.trim();
  if (!sid) return;

  console.info("[DIBAY_CALL_ENGINE]", "remote_terminal_received", {
    callId: sid,
    status: args.status,
    source: args.source,
  });

  const consumedReason = mapRemoteTerminalToConsumedReason(args.status);
  stopRemoteIncomingSounds(sid, `remote_${args.status}`);
  dismissAllIncomingCallNotificationsFireAndForget(sid);
  clearNativeIncomingSurface(sid);
  markCallEngineTerminalConsumed(sid);
  markCallConsumed(sid, consumedReason);
  syncCallEngineStateFromSession(sid, args.status as CommunityMessengerCallSessionStatus, false);
  await releaseCallEngineTerminalLocalState(sid, `remote_${args.status}`, {
    sessionId: sid,
    source: args.source,
  });

  console.info("[DIBAY_CALL_ENGINE]", "remote_terminal_cleanup_done", {
    callId: sid,
    status: args.status,
  });
}

export function stopRemoteIncomingSounds(callId: string, reason: string): void {
  const sid = callId.trim();
  if (!sid) return;
  dibayIncomingLaneStopRing(reason, sid);
  syncIncomingCallRing(null);
  const plugin = getSyncNativeIncomingCallPlugin();
  try {
    void plugin?.stopIncomingRingtone({ sessionId: sid });
    void plugin?.markCallConsumed({ sessionId: sid, reason });
  } catch {
    /* best-effort */
  }
}
