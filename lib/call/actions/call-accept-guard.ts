"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { logDibayCallFlow } from "@/lib/call/logging/call-flow-log";
import { prepareNativeCallAccept } from "@/lib/call/native/native-call-service";
import { callPermissionGate } from "@/lib/call/permissions/call-permission-gate";
import type { CallPermissionRequireResult } from "@/lib/call/permissions/call-permission-types";
import { claimCallRouteLatch } from "@/lib/call/routing/call-route-latch";
import {
  releaseIncomingCallAccept,
  tryClaimIncomingCallAccept,
} from "@/lib/community-messenger/incoming-call-action-guard";
import { setDibayCallSessionPhase } from "@/lib/community-messenger/incoming-call-state";
import { dibayCallSealTerminal } from "@/lib/community-messenger/call-lifecycle";
import { callEngineActions } from "@/lib/community-messenger/call-engine";

export type CallAcceptGuardRouter = {
  replace: (href: string) => void;
};

export type CallAcceptGuardInput = {
  session: CommunityMessengerCallSession;
  router: CallAcceptGuardRouter;
  source: string;
  hrefOverride?: string;
  /** native prep(FGS) 실행 여부 — Web 배너는 true, 이미 native prep 된 route는 false */
  runNativePrep?: boolean;
  /** 권한 프롬프트 시도 */
  promptOnDenied?: boolean;
  /** PATCH 완료 후 route open */
  openRoute?: boolean;
};

export type CallAcceptGuardResult =
  | { ok: true; sessionId: string; session: CommunityMessengerCallSession; permission: CallPermissionRequireResult }
  | {
      ok: false;
      sessionId: string;
      reason:
        | "duplicate_accept_blocked"
        | "permission_denied"
        | "native_prep_failed"
        | "patch_failed"
        | "route_latch_rejected"
        | "exception";
      permission?: CallPermissionRequireResult;
    };

let patchAcceptInvocationCount = 0;

export function readCallAcceptGuardPatchCountForTests(): number {
  return patchAcceptInvocationCount;
}

export function resetCallAcceptGuardForTests(): void {
  patchAcceptInvocationCount = 0;
}

function buildAcceptHref(sessionId: string, hrefOverride?: string): string {
  const override = hrefOverride?.trim();
  if (override) return override;
  return `/community-messenger/calls/${encodeURIComponent(sessionId)}?action=accept&nativePrep=1&mode=active`;
}

/**
 * 수신 accept guard — 권한 → native prep → web PATCH → route latch → route open.
 * PATCH accept 는 이 함수에서만 1회 실행.
 */
export async function runCallAcceptGuard(input: CallAcceptGuardInput): Promise<CallAcceptGuardResult> {
  const s = input.session;
  const sid = s.id.trim();
  if (!sid) return { ok: false, sessionId: "", reason: "exception" };

  logDibayCallFlow("accept_click", { sessionId: sid, callId: sid, source: input.source });

  if (!tryClaimIncomingCallAccept(sid)) {
    return { ok: false, sessionId: sid, reason: "duplicate_accept_blocked" };
  }

  try {
    let permission = await callPermissionGate.requireForIncoming(s.callKind);
    if (!permission.ok && input.promptOnDenied) {
      await callPermissionGate.prompt(s.callKind, "incoming");
      permission = await callPermissionGate.requireForIncoming(s.callKind);
    }
    if (!permission.ok) {
      return { ok: false, sessionId: sid, reason: "permission_denied", permission };
    }

    setDibayCallSessionPhase(sid, "accepting");

    if (input.runNativePrep !== false) {
      const nativeOk = await prepareNativeCallAccept(sid, s.callKind);
      if (!nativeOk) {
        setDibayCallSessionPhase(sid, "incoming");
        return { ok: false, sessionId: sid, reason: "native_prep_failed", permission };
      }
    }

    logDibayCallFlow("web_accept_start", { sessionId: sid, callId: sid, source: input.source });
    patchAcceptInvocationCount += 1;
    const patched = await callEngineActions.acceptIncoming({
      callId: sid,
      source: input.source,
      debugContext: {
        sessionStatus: s.status,
        isInitiator: s.isMineInitiator,
        endedReason: s.endedReason ?? null,
      },
    });
    if (!patched.ok) {
      setDibayCallSessionPhase(sid, "incoming");
      return { ok: false, sessionId: sid, reason: "patch_failed", permission };
    }
    logDibayCallFlow("web_accept_success", { sessionId: sid, callId: sid, source: input.source });

    if (input.openRoute !== false) {
      const href = buildAcceptHref(sid, input.hrefOverride);
      const latch = claimCallRouteLatch(sid, href, input.source);
      if (!latch.ok) {
        return { ok: false, sessionId: sid, reason: "route_latch_rejected", permission };
      }
      logDibayCallFlow("route_latch_claimed", { sessionId: sid, callId: sid, href, source: input.source });
      input.router.replace(href);
    }

    return { ok: true, sessionId: sid, session: s, permission };
  } catch {
    setDibayCallSessionPhase(sid, "incoming");
    return { ok: false, sessionId: sid, reason: "exception" };
  } finally {
    releaseIncomingCallAccept(sid);
  }
}

/** 권한 거부로 연결 취소 — reject 대신 permission_cancelled 정리 */
export async function cancelIncomingCallForPermission(
  sessionId: string,
  reason = "permission_cancelled",
): Promise<void> {
  const sid = sessionId.trim();
  if (!sid) return;
  dibayCallSealTerminal(sid);
  logDibayCallFlow("incoming_accept_blocked_permission", { sessionId: sid, callId: sid, reason });
  await callEngineActions.patch({
    callId: sid,
    action: "missed",
    init: { clientEndedReason: reason },
    source: "call_accept_guard_permission",
  });
}
