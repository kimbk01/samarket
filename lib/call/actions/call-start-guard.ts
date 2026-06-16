"use client";

import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { bootstrapCommunityMessengerOutgoingCallSession } from "@/lib/community-messenger/call-session-navigation-seed";
import { logDibayCallFlow } from "@/lib/call/logging/call-flow-log";
import { callPermissionGate } from "@/lib/call/permissions/call-permission-gate";
import type { CallPermissionRequireResult } from "@/lib/call/permissions/call-permission-types";

export type CallStartGuardInput = {
  kind: CommunityMessengerCallKind;
  roomId?: string | null;
  peerUserId?: string | null;
  /** true면 권한 프롬프트까지 시도 */
  promptOnDenied?: boolean;
};

export type CallStartGuardResult =
  | {
      ok: true;
      sessionId: string;
      href: string;
      permission: CallPermissionRequireResult;
    }
  | {
      ok: false;
      reason: "permission_denied" | "create_failed" | "permission_blocked";
      permission: CallPermissionRequireResult;
      canFallbackToVoice?: boolean;
    };

let createCallInvocationCount = 0;

/** 테스트 전용 — createCall 호출 횟수 */
export function readCallStartGuardCreateCallCountForTests(): number {
  return createCallInvocationCount;
}

export function resetCallStartGuardForTests(): void {
  createCallInvocationCount = 0;
}

/**
 * 발신 guard — 권한 통과 후에만 createCall API 실행.
 * createCall 이전 Agora token·route·ringtone 금지.
 */
export async function runCallStartGuard(input: CallStartGuardInput): Promise<CallStartGuardResult> {
  let permission = await callPermissionGate.requireForOutgoing(input.kind);
  if (!permission.ok && input.promptOnDenied) {
    await callPermissionGate.prompt(input.kind, "outgoing");
    permission = await callPermissionGate.requireForOutgoing(input.kind);
  }
  if (!permission.ok) {
    return {
      ok: false,
      reason: "permission_denied",
      permission,
      canFallbackToVoice: permission.canFallbackToVoice,
    };
  }

  createCallInvocationCount += 1;
  const boot = await bootstrapCommunityMessengerOutgoingCallSession({
    kind: input.kind,
    roomId: input.roomId ?? null,
    peerUserId: input.peerUserId ?? null,
  });
  if (!boot.ok) {
    return { ok: false, reason: "create_failed", permission };
  }

  const sessionId = boot.session.id;
  const href = `/community-messenger/calls/${encodeURIComponent(sessionId)}`;

  logDibayCallFlow("call_start", {
    sessionId,
    callId: sessionId,
    kind: input.kind,
  });

  return {
    ok: true,
    sessionId,
    href,
    permission,
  };
}
