"use client";

import type { IAgoraRTCClient } from "agora-rtc-sdk-ng";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  clearAgoraJoinGuard,
  joinAgoraChannelSingleFlight,
} from "@/lib/call/actions/agora-join-guard";
import { logCallUxEvent } from "@/lib/community-messenger/call-engine/call-engine-debug";
import {
  isCallEngineTerminalConsumed,
  tryLockCallEngineJoinOnce,
} from "@/lib/community-messenger/call-engine/call-engine-locks";

export async function joinCallEngineAgoraOnce(args: {
  callId: string;
  client: IAgoraRTCClient;
  appId: string;
  channelName: string;
  token: string | null;
  uid: string;
  callKind: CommunityMessengerCallKind;
}): Promise<{ ok: boolean; reason?: "terminal_consumed" | "join_locked" | "duplicate" | "in_flight" }> {
  const sid = args.callId.trim();
  if (!sid || isCallEngineTerminalConsumed(sid)) return { ok: false, reason: "terminal_consumed" };
  if (!tryLockCallEngineJoinOnce(sid)) return { ok: false, reason: "join_locked" };
  logCallUxEvent("call_agora_join_start", { callId: sid, sessionId: sid, callKind: args.callKind });
  const result = await joinAgoraChannelSingleFlight(
    sid,
    {
      client: args.client,
      appId: args.appId,
      channelName: args.channelName,
      token: args.token,
      uid: args.uid,
    },
    { callKind: args.callKind },
  );
  if (!result.ok) return { ok: false, reason: result.reason };
  logCallUxEvent("call_agora_join_success", { callId: sid, sessionId: sid, callKind: args.callKind });
  return { ok: true };
}

export function clearCallEngineAgoraJoin(callId: string): void {
  clearAgoraJoinGuard(callId);
}
