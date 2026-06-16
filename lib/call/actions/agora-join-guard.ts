"use client";

import type { IAgoraRTCClient } from "agora-rtc-sdk-ng";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { logDibayCallFlow } from "@/lib/call/logging/call-flow-log";

type JoinArgs = {
  client: IAgoraRTCClient;
  appId: string;
  channelName: string;
  token: string | null;
  uid: string;
};

const joinedCallIds = new Set<string>();
const joinFlights = new Map<string, Promise<void>>();

export function clearAgoraJoinGuard(callId: string | null | undefined): void {
  const sid = callId?.trim();
  if (!sid) return;
  joinedCallIds.delete(sid);
  joinFlights.delete(sid);
}

export function resetAgoraJoinGuardForTests(): void {
  joinedCallIds.clear();
  joinFlights.clear();
}

export function hasAgoraJoinCompleted(callId: string): boolean {
  return joinedCallIds.has(callId.trim());
}

/**
 * callId 기준 joinChannel 단일 비행 — 중복 시 agora_join_duplicate_blocked.
 */
export async function joinCommunityMessengerAgoraChannelOnce(
  callId: string,
  args: JoinArgs,
  meta?: { callKind?: CommunityMessengerCallKind },
): Promise<{ ok: true } | { ok: false; reason: "duplicate" | "in_flight" }> {
  const sid = callId.trim();
  if (!sid) return { ok: false, reason: "duplicate" };

  if (joinedCallIds.has(sid)) {
    logDibayCallFlow("agora_join_duplicate_blocked", {
      sessionId: sid,
      callId: sid,
      callKind: meta?.callKind,
      reason: "already_joined",
    });
    return { ok: false, reason: "duplicate" };
  }

  const inflight = joinFlights.get(sid);
  if (inflight) {
    logDibayCallFlow("agora_join_duplicate_blocked", {
      sessionId: sid,
      callId: sid,
      callKind: meta?.callKind,
      reason: "in_flight",
    });
    return { ok: false, reason: "in_flight" };
  }

  logDibayCallFlow("agora_join_start", { sessionId: sid, callId: sid, callKind: meta?.callKind });

  const flight = (async () => {
    const { joinCommunityMessengerAgoraChannel } = await import("@/lib/community-messenger/call-provider/client");
    await joinCommunityMessengerAgoraChannel(args);
    joinedCallIds.add(sid);
    logDibayCallFlow("agora_join_success", { sessionId: sid, callId: sid, callKind: meta?.callKind });
  })();

  joinFlights.set(sid, flight);
  try {
    await flight;
    return { ok: true };
  } finally {
    joinFlights.delete(sid);
  }
}
