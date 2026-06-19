"use client";

import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { getActiveCallSessionCallId, isLiveActiveCallPhase, readActiveCallSessionSnapshot } from "@/lib/call/active-call-session";

const SYNC_EVENT = "dibay:call-action-lock-sync";

export type CallActionLock = {
  key: string;
  callId: string | null;
  acquiredAt: number;
};

let currentLock: CallActionLock | null = null;

function notifySync(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SYNC_EVENT));
}

export function subscribeCallActionLock(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onStoreChange();
  window.addEventListener(SYNC_EVENT, handler);
  return () => window.removeEventListener(SYNC_EVENT, handler);
}

export function readCallActionLockSnapshot(): CallActionLock | null {
  return currentLock;
}

export function buildStartCallActionLockKey(input: {
  roomId?: string | null;
  peerUserId?: string | null;
  mediaType: CommunityMessengerCallKind;
}): string {
  const room = input.roomId?.trim() ?? "";
  const peer = input.peerUserId?.trim() ?? "";
  const target = room || peer || "unknown";
  return `start-call:${target}:${input.mediaType}`;
}

export function isCallActionLockHeld(): boolean {
  return currentLock != null;
}

export function isOutgoingCallStartBlocked(): boolean {
  const session = readActiveCallSessionSnapshot();
  if (session && isLiveActiveCallPhase(session.phase)) return true;
  return currentLock != null;
}

export type AcquireCallActionLockResult =
  | { ok: true; reused: false; key: string }
  | { ok: false; reason: "active_call"; existingCallId: string }
  | { ok: false; reason: "lock_held"; key: string };

/**
 * 발신 API 전역 lock — 서버 응답/실패/종료까지 유지 (releaseCallActionLock).
 */
export function acquireCallActionLock(input: {
  roomId?: string | null;
  peerUserId?: string | null;
  mediaType: CommunityMessengerCallKind;
}): AcquireCallActionLockResult {
  const existingCallId = getActiveCallSessionCallId();
  if (existingCallId) {
    logDibayCall("call_history_start_blocked_active_call", {
      sessionId: existingCallId,
      callId: existingCallId,
      key: buildStartCallActionLockKey(input),
    });
    return { ok: false, reason: "active_call", existingCallId };
  }
  const key = buildStartCallActionLockKey(input);
  if (currentLock) {
    logDibayCall("call_history_start_lock_reused", {
      sessionId: currentLock.callId ?? undefined,
      callId: currentLock.callId ?? undefined,
      key: currentLock.key,
    });
    return { ok: false, reason: "lock_held", key: currentLock.key };
  }
  currentLock = { key, callId: null, acquiredAt: Date.now() };
  logDibayCall("call_history_start_lock_acquired", { key });
  notifySync();
  return { ok: true, reused: false, key };
}

export function bindCallActionLockCallId(callId: string): void {
  const sid = callId.trim();
  if (!sid || !currentLock) return;
  currentLock = { ...currentLock, callId: sid };
  notifySync();
}

export function releaseCallActionLock(reason = "done"): void {
  if (!currentLock) return;
  currentLock = null;
  notifySync();
  if (typeof window !== "undefined") {
    console.info("[DIBAY_CALL] call_history_start_lock_released", { reason, at: Date.now() });
  }
}

/**
 * terminal cleanup — bound callId 와 일치할 때만 release (다른 통화 lock 오염 방지).
 * bootstrap 중 callId 미바인드면 activeCallSession callId 로 판단한다.
 */
export function releaseCallActionLockForCallId(
  callId: string | null | undefined,
  reason = "terminal",
): void {
  if (!currentLock) return;
  const sid = callId?.trim() ?? "";
  const bound = currentLock.callId?.trim() ?? "";
  if (bound) {
    if (sid && bound !== sid) return;
    releaseCallActionLock(reason);
    return;
  }
  if (!sid) {
    releaseCallActionLock(reason);
    return;
  }
  const liveCallId = getActiveCallSessionCallId();
  if (liveCallId && liveCallId !== sid) return;
  releaseCallActionLock(reason);
}

export function resetCallActionLockForTests(): void {
  currentLock = null;
}
