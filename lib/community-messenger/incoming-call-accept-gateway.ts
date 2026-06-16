"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { runCallAcceptGuard } from "@/lib/call/actions/call-accept-guard";
import { fetchCommunityMessengerCallSessionByIdClient } from "@/lib/community-messenger/call-http-actions";
import {
  releaseIncomingCallReject,
  tryClaimIncomingCallReject,
} from "@/lib/community-messenger/incoming-call-action-guard";
import { markNativeCalleeAcceptPending } from "@/lib/community-messenger/native-callee-accept-entry";
import {
  primeCommunityMessengerCallNavigationSeed,
  rememberCallNavigationReturnPath,
} from "@/lib/community-messenger/call-session-navigation-seed";
import { unlockCommunityMessengerCallPlaybackFromUserGesture } from "@/lib/community-messenger/call-feedback-sound";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import { dibayCallSealTerminal, dibayIncomingLaneStopRing } from "@/lib/community-messenger/call-lifecycle";
import { dismissAllIncomingCallNotificationsFireAndForget } from "@/lib/push/native/dismiss-native-incoming-call-notification";
import {
  isDibayCallConsumed,
  markCallConsumed,
  setDibayCallSessionPhase,
  type CallConsumedReason,
} from "@/lib/community-messenger/incoming-call-state";
import { postCommunityMessengerCallIncomingConsumedBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { patchCommunityMessengerCallSession } from "@/lib/call/call-actions";

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
  return `/community-messenger/calls/${encodeURIComponent(sessionId)}?action=accept&nativePrep=1&mode=active`;
}

/**
 * 수락·거절·missed·ended 직후 공통 — 벨·알림·consumed·bus.
 * router.replace 는 호출하지 않는다.
 */
export function applyIncomingCallConsumedSideEffects(
  sessionId: string,
  reason: CallConsumedReason,
  source: string
): void {
  const sid = sessionId.trim();
  if (!sid) return;
  if (isDibayCallConsumed(sid)) {
    logDibayCall("accept_skip_duplicate", {
      sessionId: sid,
      callId: sid,
      reason: "already_consumed",
      source,
    });
    dibayIncomingLaneStopRing("already_consumed", sid);
    dismissAllIncomingCallNotificationsFireAndForget(sid);
    return;
  }

  setDibayCallSessionPhase(sid, reason === "accepted" ? "accepting" : "consumed", reason);
  dibayIncomingLaneStopRing(`consumed_${reason}`, sid);
  dismissAllIncomingCallNotificationsFireAndForget(sid);
  markCallConsumed(sid, reason);
  postCommunityMessengerCallIncomingConsumedBusEvent(sid, reason);
  logDibayCall("ring_stop", { sessionId: sid, callId: sid, reason: `consumed_${reason}`, source });
}

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
  reason?: "already_consumed" | "session_fetch_failed" | "duplicate_accept_blocked" | "patch_failed" | "permission_denied" | "exception";
}> {
  const sid = sessionId.trim();
  if (!sid) return { ok: false, sessionId: "", reason: "exception" };

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
  reason?: "duplicate_accept_blocked" | "already_consumed" | "permission_denied" | "patch_failed" | "exception";
}> {
  return runIncomingCallAccept(args);
}

/**
 * 단일 수신 수락 게이트웨이 — call-accept-guard 위임.
 *
 * 계약:
 * - PATCH accept 는 call-accept-guard 에서만 1회.
 * - `nativePrep=1` 은 native FGS 정리 완료 — CallClient PATCH 재실행 금지.
 */
export async function runIncomingCallAccept(args: RunIncomingCallAcceptArgs): Promise<{
  ok: boolean;
  sessionId: string;
  reason?: "duplicate_accept_blocked" | "already_consumed" | "permission_denied" | "patch_failed" | "exception";
}> {
  const s = args.session;
  const sid = s.id.trim();
  if (!sid) return { ok: false, sessionId: "", reason: "exception" };

  if (isDibayCallConsumed(sid)) {
    return { ok: false, sessionId: sid, reason: "already_consumed" };
  }

  unlockCommunityMessengerCallPlaybackFromUserGesture();
  rememberCallNavigationReturnPath();
  primeCommunityMessengerCallNavigationSeed(sid, s);

  const hrefOverride =
    args.hrefOverride ??
    `/community-messenger/calls/${encodeURIComponent(sid)}?action=accept&nativePrep=1&mode=active`;

  const result = await runCallAcceptGuard({
    session: s,
    router: args.router,
    source: args.source,
    hrefOverride,
    promptOnDenied: true,
    runNativePrep: true,
    openRoute: true,
  });

  if (result.ok) {
    if (args.markNativeAcceptPending ?? true) {
      markNativeCalleeAcceptPending(sid);
    }
    applyIncomingCallConsumedSideEffects(sid, "accepted", args.source);
    logDibayCall("accept_success", { sessionId: sid, callId: sid, source: args.source });
    return { ok: true, sessionId: sid };
  }

  const reason =
    result.reason === "permission_denied"
      ? "permission_denied"
      : result.reason === "patch_failed"
        ? "patch_failed"
        : result.reason === "duplicate_accept_blocked"
          ? "duplicate_accept_blocked"
          : "exception";

  return { ok: false, sessionId: sid, reason };
}

export async function runIncomingCallReject(args: RunIncomingCallRejectArgs): Promise<{
  ok: boolean;
  sessionId: string;
  reason?: "duplicate_reject_blocked" | "patch_failed" | "exception";
}> {
  const sid = args.sessionId.trim();
  if (!sid) return { ok: false, sessionId: "", reason: "exception" };

  unlockCommunityMessengerCallPlaybackFromUserGesture();
  if (!tryClaimIncomingCallReject(sid)) {
    return { ok: false, sessionId: sid, reason: "duplicate_reject_blocked" };
  }

  try {
    dibayIncomingLaneStopRing("reject_gateway_start", sid);
    dismissAllIncomingCallNotificationsFireAndForget(sid);
    const patched = await patchCommunityMessengerCallSession(sid, "reject");
    if (!patched.ok) return { ok: false, sessionId: sid, reason: "patch_failed" };
    dibayCallSealTerminal(sid);
    applyIncomingCallConsumedSideEffects(sid, "declined", args.source);
    return { ok: true, sessionId: sid };
  } catch {
    return { ok: false, sessionId: sid, reason: "exception" };
  } finally {
    releaseIncomingCallReject(sid);
  }
}
