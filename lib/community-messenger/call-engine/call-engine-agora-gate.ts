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
import { getCallEngineState } from "@/lib/community-messenger/call-engine/call-engine-state";

const OUTGOING_CONNECT_TIMEOUT_MS = 45_000;
const outgoingConnectTimers = new Map<string, number>();

function clearOutgoingConnectTimer(callId: string): void {
  const t = outgoingConnectTimers.get(callId);
  if (t) clearTimeout(t);
  outgoingConnectTimers.delete(callId);
}

function canJoinForPhase(callId: string): boolean {
  const phase = getCallEngineState(callId);
  return (
    phase === "accepting" ||
    phase === "joining" ||
    phase === "outgoing_ringing" ||
    phase === "connected" ||
    phase === "reconnecting"
  );
}

export async function joinCallEngineAgoraOnce(args: {
  callId: string;
  client: IAgoraRTCClient;
  appId: string;
  channelName: string;
  token: string | null;
  uid: string;
  callKind: CommunityMessengerCallKind;
  isOutgoing?: boolean;
}): Promise<{ ok: boolean; reason?: "terminal_consumed" | "join_locked" | "duplicate" | "in_flight" | "invalid_phase" }> {
  const sid = args.callId.trim();
  if (!sid || isCallEngineTerminalConsumed(sid)) return { ok: false, reason: "terminal_consumed" };
  if (!canJoinForPhase(sid)) return { ok: false, reason: "invalid_phase" };
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
  clearOutgoingConnectTimer(sid);
  logCallUxEvent("call_agora_join_success", { callId: sid, sessionId: sid, callKind: args.callKind });
  return { ok: true };
}

export function scheduleCallEngineOutgoingConnectTimeout(callId: string, onTimeout: () => void): void {
  const sid = callId.trim();
  if (!sid || typeof window === "undefined") return;
  clearOutgoingConnectTimer(sid);
  const timer = window.setTimeout(() => {
    outgoingConnectTimers.delete(sid);
    if (getCallEngineState(sid) === "outgoing_ringing") {
      onTimeout();
    }
  }, OUTGOING_CONNECT_TIMEOUT_MS);
  outgoingConnectTimers.set(sid, timer);
}

export async function joinCallEngineGroupPublishOnce(args: {
  callId: string;
  publish: () => Promise<void>;
}): Promise<{ ok: boolean; reason?: "terminal_consumed" | "join_locked" | "invalid_phase" }> {
  const sid = args.callId.trim();
  if (!sid || isCallEngineTerminalConsumed(sid)) return { ok: false, reason: "terminal_consumed" };
  if (!tryLockCallEngineJoinOnce(sid)) return { ok: false, reason: "join_locked" };
  try {
    await args.publish();
    return { ok: true };
  } catch {
    return { ok: false, reason: "invalid_phase" };
  }
}

export function clearCallEngineAgoraJoin(callId: string): void {
  clearAgoraJoinGuard(callId);
  clearOutgoingConnectTimer(callId);
}

export function resetCallEngineAgoraGateForTests(): void {
  for (const id of outgoingConnectTimers.keys()) {
    clearOutgoingConnectTimer(id);
  }
}
