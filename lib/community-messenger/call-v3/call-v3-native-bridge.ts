"use client";

import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";

export type CallV3NativeAction = "accept" | "reject";

export type CallV3NativeEvent = {
  callId: string;
  action: CallV3NativeAction;
  source: string;
};

let bridgeReady = false;
const pendingQueue: CallV3NativeEvent[] = [];
const replayedKeys = new Set<string>();

function replayKey(event: CallV3NativeEvent): string {
  return `${event.callId}:${event.action}`;
}

function replayCallV3NativeEvent(event: CallV3NativeEvent): void {
  const key = replayKey(event);
  if (replayedKeys.has(key)) {
    logCallV3("native_replay_skipped_duplicate", { callId: event.callId, action: event.action });
    return;
  }
  replayedKeys.add(key);
  logCallV3("native_replay", {
    callId: event.callId,
    action: event.action,
    source: event.source,
  });
  // Phase F: callV3Accept / callV3Reject + PATCH once
}

export function markCallV3NativeBridgeReady(): void {
  if (bridgeReady) return;
  bridgeReady = true;
  const queued = pendingQueue.splice(0, pendingQueue.length);
  for (const event of queued) {
    replayCallV3NativeEvent(event);
  }
}

export function enqueueCallV3NativeEvent(event: CallV3NativeEvent): void {
  const callId = event.callId.trim();
  if (!callId) return;
  const normalized: CallV3NativeEvent = { ...event, callId };
  if (!bridgeReady) {
    pendingQueue.push(normalized);
    logCallV3("native_pending_queued", {
      callId,
      action: normalized.action,
      source: normalized.source,
    });
    return;
  }
  replayCallV3NativeEvent(normalized);
}

export function clearCallV3NativePendingForCall(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  for (let i = pendingQueue.length - 1; i >= 0; i -= 1) {
    if (pendingQueue[i]?.callId === sid) pendingQueue.splice(i, 1);
  }
  replayedKeys.delete(`${sid}:accept`);
  replayedKeys.delete(`${sid}:reject`);
}

export function resetCallV3NativeBridgeForTests(): void {
  bridgeReady = false;
  pendingQueue.length = 0;
  replayedKeys.clear();
}
