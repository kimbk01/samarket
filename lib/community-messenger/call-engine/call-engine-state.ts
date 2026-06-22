"use client";

import type { CommunityMessengerCallSessionStatus } from "@/lib/community-messenger/types";
import type { CallEngineState } from "@/lib/community-messenger/call-engine/call-engine-types";
import { assertCallEngineTransition } from "@/lib/community-messenger/call-engine/call-engine-transitions";
import { isCallEngineTerminalConsumed } from "@/lib/community-messenger/call-engine/call-engine-locks";

const stateByCallId = new Map<string, CallEngineState>();

function normalize(callId: string): string {
  return callId.trim();
}

export function mapSessionStatusToCallEngineState(
  status: CommunityMessengerCallSessionStatus,
  isInitiator: boolean,
): CallEngineState {
  switch (status) {
    case "ringing":
      return isInitiator ? "outgoing_ringing" : "incoming_ringing";
    case "active":
      return "connected";
    case "ended":
      return "ended";
    case "rejected":
      return "rejected";
    case "missed":
      return "missed";
    case "cancelled":
      return "cancelled";
    default:
      return "failed";
  }
}

export function getCallEngineState(callId: string): CallEngineState {
  const sid = normalize(callId);
  if (!sid) return "idle";
  return stateByCallId.get(sid) ?? "idle";
}

export function setCallEngineState(callId: string, next: CallEngineState): CallEngineState {
  const sid = normalize(callId);
  if (!sid) return "idle";
  const prev = getCallEngineState(sid);
  assertCallEngineTransition(prev, next);
  stateByCallId.set(sid, next);
  notifySnapshotListeners(sid);
  return next;
}

/** 서버 hydrate — terminal consumed 이후 무시, transition assert 생략 */
export function syncCallEngineStateFromSession(
  callId: string,
  status: CommunityMessengerCallSessionStatus,
  isInitiator: boolean,
): CallEngineState {
  const sid = normalize(callId);
  if (!sid || isCallEngineTerminalConsumed(sid)) return getCallEngineState(sid);
  const mapped = mapSessionStatusToCallEngineState(status, isInitiator);
  stateByCallId.set(sid, mapped);
  notifySnapshotListeners(sid);
  return mapped;
}

type SnapshotListener = (callId: string) => void;
const snapshotListeners = new Set<SnapshotListener>();

export function subscribeCallEngineStateListener(listener: SnapshotListener): () => void {
  snapshotListeners.add(listener);
  return () => snapshotListeners.delete(listener);
}

function notifySnapshotListeners(callId: string): void {
  for (const listener of snapshotListeners) {
    listener(callId);
  }
}

export function clearCallEngineState(callId: string): void {
  const sid = normalize(callId);
  if (!sid) return;
  stateByCallId.delete(sid);
}

export function resetCallEngineStateForTests(): void {
  stateByCallId.clear();
  snapshotListeners.clear();
}
