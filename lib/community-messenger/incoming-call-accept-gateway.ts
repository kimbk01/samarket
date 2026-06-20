"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { ensureCallMediaForUserGesture } from "@/lib/community-messenger/call-media-permission-preflight";
import { patchCommunityMessengerCallSession, fetchCommunityMessengerCallSessionByIdClient } from "@/lib/community-messenger/call-http-actions";
import {
  releaseIncomingCallAccept,
  releaseIncomingCallReject,
  tryClaimIncomingCallAccept,
  tryClaimIncomingCallReject,
} from "@/lib/community-messenger/incoming-call-action-guard";
import { markNativeCalleeAcceptPending } from "@/lib/community-messenger/native-callee-accept-entry";
import {
  primeCommunityMessengerCallNavigationSeed,
  rememberCallNavigationReturnPath,
} from "@/lib/community-messenger/call-session-navigation-seed";
import { writeCallAcceptHydratePeerFromSession } from "@/lib/community-messenger/call-accept-hydrate-peer";
import { primeCommunityMessengerCallConnectionPrefetch } from "@/lib/community-messenger/call-connection-prefetch";
import { unlockCommunityMessengerCallPlaybackFromUserGesture } from "@/lib/community-messenger/call-feedback-sound";
import { getActiveCallSessionCallId, setActiveCallSession } from "@/lib/call/active-call-session";
import { mapSessionStatusToActiveCallPhase } from "@/lib/call/map-session-to-active-call";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import { dibayIncomingLaneStopRing } from "@/lib/community-messenger/call-lifecycle";
import { dismissAllIncomingCallNotificationsFireAndForget } from "@/lib/push/native/dismiss-native-incoming-call-notification";
import { isDibayCallConsumed, setDibayCallSessionPhase } from "@/lib/community-messenger/incoming-call-state";
import { applyIncomingCallConsumedSideEffects } from "@/lib/community-messenger/incoming-call-consumed-side-effects";
import { isCallEngineV2Enabled } from "@/lib/call-engine/flag";
import { acceptCall as engineAcceptCall } from "@/lib/call-engine/accept-call";
import { runEngineIncomingCallReject } from "@/lib/call-engine/close-call-session";

export type IncomingCallGatewayRouter = {
  replace: (href: string) => void;
};

export type IncomingCallAcceptSource =
  | "incoming_banner_accept"
  | "incoming_banner_expand"
  | "incoming_overlay_accept"
  | "call_client_accept"
  | "call_client_hydrate_accept"
  | "native_notification_accept"
  | "native_activity_accept";

export type RunIncomingCallAcceptArgs = {
  session: CommunityMessengerCallSession;
  router: IncomingCallGatewayRouter;
  /** 기본: `/calls/:id?action=accept&nativeAccept=1` */
  hrefOverride?: string;
  /** 기본: true (call route 진입 전용) */
  /** CallClient 등 이미 `/calls/:id` 에 있을 때 replace 생략 */
  skipRouteReplace?: boolean;
  /** 기본: true — native pending accept 시 false 로 gateway 가 중복 mark 방지 */
  markNativeAcceptPending?: boolean;
  source: IncomingCallAcceptSource;
};

export type RunIncomingCallRejectArgs = {
  sessionId: string;
  source:
    | "incoming_banner_reject"
    | "incoming_overlay_reject"
    | "call_client_reject"
    | "call_client_hydrate_reject";
};

function buildActiveCallAcceptHref(sessionId: string, hrefOverride?: string | null): string {
  const override = hrefOverride?.trim();
  if (override) return override;
  return `/community-messenger/calls/${encodeURIComponent(sessionId)}?action=accept&nativeAccept=1&mode=active`;
}

export { applyIncomingCallConsumedSideEffects } from "@/lib/community-messenger/incoming-call-consumed-side-effects";

/**
 * active 통화 화면 replace — 프로젝트 내 유일한 accept-route replace 진입점.
 */
export function replaceActiveIncomingCallRoute(
  router: IncomingCallGatewayRouter,
  sessionId: string,
  hrefOverride?: string | null,
  source?: string
): void {
  const sid = sessionId.trim();
  if (!sid) return;
  const href = buildActiveCallAcceptHref(sid, hrefOverride);
  logDibayCall("active_route_replace", { sessionId: sid, callId: sid, href, source: source ?? "gateway" });
  router.replace(href);
}

/**
 * 네이티브 수락(잠금·알림) — PATCH 없이 pending 만 WebView 로 전달된 뒤 단일 gateway 가 처리.
 * native accept → pending route → acceptIncomingCallOnce → PATCH 1회 → consumed → replace 1회
 */
export async function runNativePendingAcceptCall(
  router: IncomingCallGatewayRouter,
  sessionId: string,
  source: IncomingCallAcceptSource = "native_notification_accept"
): Promise<{
  ok: boolean;
  sessionId: string;
  reason?: "already_consumed" | "session_fetch_failed" | "duplicate_accept_blocked" | "patch_failed" | "permission_denied" | "join_failed" | "exception";
}> {
  const sid = sessionId.trim();
  if (!sid) return { ok: false, sessionId: "", reason: "exception" };

  if (isCallEngineV2Enabled()) {
    const result = await engineAcceptCall(sid, source, { router });
    return {
      ok: result.ok,
      sessionId: result.sessionId,
      reason: result.reason as typeof result.reason | undefined,
    };
  }

  if (isDibayCallConsumed(sid)) {
    logDibayCall("accept_skip_duplicate", {
      sessionId: sid,
      callId: sid,
      reason: "native_pending_consumed",
      source,
    });
    return { ok: false, sessionId: sid, reason: "already_consumed" };
  }

  markNativeCalleeAcceptPending(sid);
  dibayIncomingLaneStopRing(`native_pending_${source}`, sid);
  dismissAllIncomingCallNotificationsFireAndForget(sid);
  logDibayCall("accept_pending_web", { sessionId: sid, callId: sid, source });

  const session = await fetchCommunityMessengerCallSessionByIdClient(sid);
  if (!session) {
    logDibayCall("accept_failed", { sessionId: sid, callId: sid, source, reason: "session_fetch_failed" });
    return { ok: false, sessionId: sid, reason: "session_fetch_failed" };
  }

  return acceptIncomingCallOnce({
    session,
    router,
    source,
    markNativeAcceptPending: false,
  });
}

/** @deprecated use runNativePendingAcceptCall — kept for contract grep stability */
export function finalizeNativeAcceptCallRoute(
  router: IncomingCallGatewayRouter,
  sessionId: string,
  _path?: string | null,
  source: IncomingCallAcceptSource = "native_notification_accept"
): void {
  void runNativePendingAcceptCall(router, sessionId, source);
}

/**
 * 단일 수락 게이트 — native / notification / banner 모두 이 함수만 호출.
 */
export async function acceptIncomingCallOnce(args: RunIncomingCallAcceptArgs): Promise<{
  ok: boolean;
  sessionId: string;
  reason?: "duplicate_accept_blocked" | "already_consumed" | "permission_denied" | "patch_failed" | "session_fetch_failed" | "join_failed" | "exception";
}> {
  if (isCallEngineV2Enabled()) {
    const result = await engineAcceptCall(args.session.id, args.source, {
      router: args.router,
      skipRouteReplace: args.skipRouteReplace,
      session: args.session,
      hrefOverride: args.hrefOverride,
    });
    return {
      ok: result.ok,
      sessionId: result.sessionId,
      reason: result.reason as typeof result.reason | undefined,
    };
  }
  return runIncomingCallAccept(args);
}

/**
 * 단일 수신 수락 게이트웨이.
 *
 * 계약:
 * - PATCH accept 는 여기서만 1회.
 * - router.replace 는 replaceActiveIncomingCallRoute 에서만.
 * - `nativeAccept=1` 은 PATCH 완료 의미 — CallClient 는 재실행 금지.
 */
export async function runIncomingCallAccept(args: RunIncomingCallAcceptArgs): Promise<{
  ok: boolean;
  sessionId: string;
  reason?: "duplicate_accept_blocked" | "already_consumed" | "permission_denied" | "patch_failed" | "exception";
}> {
  const s = args.session;
  const sid = s.id.trim();
  if (!sid) return { ok: false, sessionId: "", reason: "exception" };

  logDibayCall("incoming_accept_click", { sessionId: sid, callId: sid, source: args.source });

  const liveCallId = getActiveCallSessionCallId();
  if (liveCallId && liveCallId !== sid) {
    logDibayCall("call_history_start_blocked_active_call", {
      sessionId: sid,
      callId: sid,
      existingCallId: liveCallId,
      source: args.source,
    });
    return { ok: false, sessionId: sid, reason: "duplicate_accept_blocked" };
  }

  /** PATCH·권한 대기 전 OS 벨 즉시 중지 (reject 와 동일 — 로그: accept 후 native ring_stop 누락) */
  dibayIncomingLaneStopRing("accept_pressed_immediate", sid);
  dismissAllIncomingCallNotificationsFireAndForget(sid);

  if (isDibayCallConsumed(sid)) {
    logDibayCall("accept_skip_duplicate", {
      sessionId: sid,
      callId: sid,
      reason: "consumed",
      source: args.source,
    });
    logDibayCall("incoming_ignored_consumed", { sessionId: sid, callId: sid, source: args.source });
    return { ok: false, sessionId: sid, reason: "already_consumed" };
  }

  unlockCommunityMessengerCallPlaybackFromUserGesture();
  rememberCallNavigationReturnPath();
  writeCallAcceptHydratePeerFromSession(s, args.source);
  primeCommunityMessengerCallNavigationSeed(sid, s);
  primeCommunityMessengerCallConnectionPrefetch(sid);

  if (!tryClaimIncomingCallAccept(sid)) {
    logDibayCall("accept_failed", {
      sessionId: sid,
      callId: sid,
      source: args.source,
      reason: "duplicate_accept_blocked",
    });
    logDibayCall("accept_skip_duplicate", {
      sessionId: sid,
      callId: sid,
      reason: "duplicate_accept_blocked",
      source: args.source,
    });
    return { ok: false, sessionId: sid, reason: "duplicate_accept_blocked" };
  }

  try {
    logDibayCall("accept_start", { sessionId: sid, callId: sid, source: args.source });
    setDibayCallSessionPhase(sid, "accepting");

    const permission = await ensureCallMediaForUserGesture(s.callKind);
    if (!permission.ok) {
      setDibayCallSessionPhase(sid, "incoming");
      logDibayCall("accept_failed", { sessionId: sid, callId: sid, source: args.source, reason: "permission_denied" });
      return { ok: false, sessionId: sid, reason: "permission_denied" };
    }

    const patched = await patchCommunityMessengerCallSession(
      sid,
      "accept",
      undefined,
      {
        sessionStatus: s.status,
        isInitiator: s.isMineInitiator,
        endedReason: s.endedReason ?? null,
      }
    );
    if (!patched.ok || !patched.session) {
      setDibayCallSessionPhase(sid, "incoming");
      logDibayCall("accept_failed", { sessionId: sid, callId: sid, source: args.source, reason: "patch_failed" });
      return { ok: false, sessionId: sid, reason: "patch_failed" };
    }

    if (args.markNativeAcceptPending ?? true) {
      markNativeCalleeAcceptPending(sid);
    }

    applyIncomingCallConsumedSideEffects(sid, "accepted", args.source);
    logDibayCall("accept_success", { sessionId: sid, callId: sid, source: args.source });

    const updated = patched.session;
    writeCallAcceptHydratePeerFromSession(updated, "accept_patch_ok");
    /** replace 직전 active 세션 시드 — ringing seed 로 첫 paint 가 IncomingCallView 로 튀는 것 방지 (P1-1b) */
    primeCommunityMessengerCallNavigationSeed(updated.id, updated);
    const phase = mapSessionStatusToActiveCallPhase(updated, false);
    if (phase !== "idle") {
      setActiveCallSession(
        {
          callId: updated.id,
          roomId: updated.roomId,
          peerUserId: updated.peerUserId,
          role: "callee",
          mediaType: updated.callKind,
          phase,
        },
        "incoming_accept",
      );
    }

    if (!args.skipRouteReplace) {
      replaceActiveIncomingCallRoute(args.router, sid, args.hrefOverride, args.source);
    }
    return { ok: true, sessionId: sid };
  } catch {
    setDibayCallSessionPhase(sid, "incoming");
    logDibayCall("call_route_open_failed", { sessionId: sid, callId: sid, source: args.source });
    return { ok: false, sessionId: sid, reason: "exception" };
  } finally {
    releaseIncomingCallAccept(sid);
  }
}

export async function runIncomingCallReject(args: RunIncomingCallRejectArgs): Promise<{
  ok: boolean;
  sessionId: string;
  reason?: "duplicate_reject_blocked" | "patch_failed" | "exception";
}> {
  if (isCallEngineV2Enabled()) {
    return runEngineIncomingCallReject(args);
  }

  const sid = args.sessionId.trim();
  if (!sid) return { ok: false, sessionId: "", reason: "exception" };

  unlockCommunityMessengerCallPlaybackFromUserGesture();
  if (!tryClaimIncomingCallReject(sid)) {
    return { ok: false, sessionId: sid, reason: "duplicate_reject_blocked" };
  }

  try {
    logDibayCall("reject_patch_start", { sessionId: sid, callId: sid, source: args.source });
    dibayIncomingLaneStopRing("reject_gateway_start", sid);
    dismissAllIncomingCallNotificationsFireAndForget(sid);
    const patched = await patchCommunityMessengerCallSession(sid, "reject");
    if (!patched.ok) {
      logDibayCall("reject_patch_failed", { sessionId: sid, callId: sid, source: args.source });
      applyIncomingCallConsumedSideEffects(sid, "declined", args.source);
      return { ok: false, sessionId: sid, reason: "patch_failed" };
    }
    logDibayCall("reject_patch_done", { sessionId: sid, callId: sid, source: args.source });
    applyIncomingCallConsumedSideEffects(sid, "declined", args.source);
    return { ok: true, sessionId: sid };
  } catch {
    applyIncomingCallConsumedSideEffects(sid, "declined", args.source);
    return { ok: false, sessionId: sid, reason: "exception" };
  } finally {
    releaseIncomingCallReject(sid);
  }
}
