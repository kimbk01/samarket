"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";

export type AgoraJoinDelegate = (session: CommunityMessengerCallSession) => Promise<void>;
export type MediaDisposeDelegate = (input?: { domAudioNuclear?: boolean }) => Promise<void>;

let agoraJoinDelegate: AgoraJoinDelegate | null = null;
let mediaDisposeDelegate: MediaDisposeDelegate | null = null;
const joinFlights = new Map<string, Promise<boolean>>();

export function registerAgoraJoinDelegate(fn: AgoraJoinDelegate | null): void {
  agoraJoinDelegate = fn;
}

export function registerMediaDisposeDelegate(fn: MediaDisposeDelegate | null): void {
  mediaDisposeDelegate = fn;
}

export function resetCallAgoraLifecycleForTests(): void {
  agoraJoinDelegate = null;
  mediaDisposeDelegate = null;
  joinFlights.clear();
}

/**
 * Active session 기준 Agora join 1회 — CallClient delegate 경유.
 */
export async function joinCallSessionOnce(session: CommunityMessengerCallSession): Promise<boolean> {
  const sid = session.id.trim();
  if (!sid || session.status !== "active") return false;

  const existing = joinFlights.get(sid);
  if (existing) return existing;

  const flight = (async (): Promise<boolean> => {
    if (!agoraJoinDelegate) {
      logDibayCall("engine_join_delegate_missing", { sessionId: sid, callId: sid });
      return false;
    }
    logDibayCall("engine_agora_join_start", { sessionId: sid, callId: sid, callKind: session.callKind });
    try {
      await agoraJoinDelegate(session);
      logDibayCall("engine_agora_join_done", { sessionId: sid, callId: sid });
      return true;
    } catch {
      logDibayCall("engine_agora_join_failed", { sessionId: sid, callId: sid });
      return false;
    }
  })();

  joinFlights.set(sid, flight);
  try {
    return await flight;
  } finally {
    joinFlights.delete(sid);
  }
}

export async function disposeCallMediaViaDelegate(input?: { domAudioNuclear?: boolean }): Promise<void> {
  if (!mediaDisposeDelegate) return;
  await mediaDisposeDelegate(input).catch(() => {});
}
