"use client";

import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";

export type CallV3NativePendingWake = {
  callId: string;
  source: string;
  path?: string | null;
  storedAt: number;
};

const pendingWakes: CallV3NativePendingWake[] = [];
const replayedWakeKeys = new Set<string>();

function wakeReplayKey(callId: string): string {
  return `${callId.trim()}:wake`;
}

export function storeCallV3NativePendingWake(input: Omit<CallV3NativePendingWake, "storedAt">): boolean {
  const callId = input.callId.trim();
  if (!callId) return false;

  const key = wakeReplayKey(callId);
  if (replayedWakeKeys.has(key)) {
    logCallV3("native_replay_skipped_duplicate", { callId, action: "wake", source: input.source });
    return false;
  }

  const duplicatePending = pendingWakes.some((item) => item.callId === callId);
  if (duplicatePending) {
    logCallV3("native_replay_skipped_duplicate", { callId, action: "wake", reason: "pending_queue" });
    return false;
  }

  pendingWakes.push({
    callId,
    source: input.source,
    path: input.path ?? null,
    storedAt: Date.now(),
  });
  logCallV3("native_pending_store", { callId, source: input.source, path: input.path ?? null });
  return true;
}

export function drainCallV3NativePendingWakes(): CallV3NativePendingWake[] {
  return pendingWakes.splice(0, pendingWakes.length);
}

export function markCallV3NativeWakeReplayed(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  replayedWakeKeys.add(wakeReplayKey(sid));
}

export function clearCallV3NativePendingForCall(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  for (let i = pendingWakes.length - 1; i >= 0; i -= 1) {
    if (pendingWakes[i]?.callId === sid) pendingWakes.splice(i, 1);
  }
  replayedWakeKeys.delete(wakeReplayKey(sid));
}

export function resetCallV3NativePendingForTests(): void {
  pendingWakes.length = 0;
  replayedWakeKeys.clear();
}
