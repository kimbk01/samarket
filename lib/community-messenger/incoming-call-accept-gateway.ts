"use client";

/**
 * Thin re-export layer — lifecycle SSOT is `call-engine-controller`.
 * SSOT_CONTRACT: cm-call-accept-gateway-patch-owner runIncomingCallAccept acceptIncomingCallOnce
 * patchCommunityMessengerCallSession — controller → call-engine-actions only (no direct gateway PATCH)
 */

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { fetchCommunityMessengerCallSessionByIdClient } from "@/lib/community-messenger/call-http-actions";
import { dibayIncomingLaneStopRing } from "@/lib/community-messenger/call-lifecycle";
import { dismissAllIncomingCallNotificationsFireAndForget } from "@/lib/push/native/dismiss-native-incoming-call-notification";
import { markNativeCalleeAcceptPending } from "@/lib/community-messenger/native-callee-accept-entry";
import { isDibayCallConsumed, markCallConsumed, setDibayCallSessionPhase, type CallConsumedReason } from "@/lib/community-messenger/incoming-call-state";
import { postCommunityMessengerCallIncomingConsumedBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import {
  dispatchCallEngineSignal,
  type CallEngineGatewayRouter,
  type IncomingCallAcceptSource,
} from "@/lib/community-messenger/call-engine/call-engine-controller";
import { routeCallEngineForAccept } from "@/lib/community-messenger/call-engine/call-engine-route-gate";

export type IncomingCallGatewayRouter = CallEngineGatewayRouter;

export type { IncomingCallAcceptSource };

export type RunIncomingCallAcceptArgs = {
  session: CommunityMessengerCallSession;
  router: IncomingCallGatewayRouter;
  hrefOverride?: string;
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

export function applyIncomingCallConsumedSideEffects(
  sessionId: string,
  reason: CallConsumedReason,
  source: string,
): void {
  const sid = sessionId.trim();
  if (!sid) return;
  if (isDibayCallConsumed(sid)) {
    dibayIncomingLaneStopRing("already_consumed", sid);
    dismissAllIncomingCallNotificationsFireAndForget(sid);
    postCommunityMessengerCallIncomingConsumedBusEvent(sid, reason);
    return;
  }
  setDibayCallSessionPhase(sid, reason === "accepted" ? "accepting" : "consumed", reason);
  dibayIncomingLaneStopRing(`consumed_${reason}`, sid);
  dismissAllIncomingCallNotificationsFireAndForget(sid);
  markCallConsumed(sid, reason);
  postCommunityMessengerCallIncomingConsumedBusEvent(sid, reason);
  logDibayCall("ring_stop", { sessionId: sid, callId: sid, reason: `consumed_${reason}`, source });
}

export function buildPostAcceptActiveCallHref(sessionId: string, hrefOverride?: string | null): string {
  const sid = sessionId.trim();
  const override = hrefOverride?.trim();
  if (override) return override;
  return `/community-messenger/calls/${encodeURIComponent(sid)}?action=accept&nativeAccept=1&mode=active`;
}

export function replaceActiveIncomingCallRoute(
  router: IncomingCallGatewayRouter,
  sessionId: string,
  hrefOverride?: string | null,
  source?: string,
): void {
  const sid = sessionId.trim();
  if (!sid) return;
  const href = buildPostAcceptActiveCallHref(sid, hrefOverride);
  logDibayCall("active_route_replace", { sessionId: sid, callId: sid, href, source: source ?? "gateway" });
  routeCallEngineForAccept(router, sid, href);
}

export async function runNativePendingAcceptCall(
  router: IncomingCallGatewayRouter,
  sessionId: string,
  source: IncomingCallAcceptSource = "native_notification_accept",
): Promise<{
  ok: boolean;
  sessionId: string;
  reason?: "already_consumed" | "session_fetch_failed" | "duplicate_accept_blocked" | "patch_failed" | "permission_denied" | "exception";
}> {
  const res = await dispatchCallEngineSignal({ type: "native_accept", sessionId, router, source });
  if (!res.ok) {
    return { ok: false, sessionId, reason: (res.error as "patch_failed") ?? "exception" };
  }
  return { ok: true, sessionId };
}

export function finalizeNativeAcceptCallRoute(
  router: IncomingCallGatewayRouter,
  sessionId: string,
  _path?: string | null,
  source: IncomingCallAcceptSource = "native_notification_accept",
): void {
  void runNativePendingAcceptCall(router, sessionId, source);
}

export async function acceptIncomingCallOnce(args: RunIncomingCallAcceptArgs): Promise<{
  ok: boolean;
  sessionId: string;
  reason?: "duplicate_accept_blocked" | "already_consumed" | "permission_denied" | "patch_failed" | "exception";
}> {
  return runIncomingCallAccept(args);
}

export async function runIncomingCallAccept(args: RunIncomingCallAcceptArgs): Promise<{
  ok: boolean;
  sessionId: string;
  reason?: "duplicate_accept_blocked" | "already_consumed" | "permission_denied" | "patch_failed" | "exception";
}> {
  const sid = args.session.id.trim();
  const res = await dispatchCallEngineSignal({
    type: "user_accept",
    session: args.session,
    router: args.router,
    hrefOverride: args.hrefOverride,
    markNativeAcceptPending: args.markNativeAcceptPending,
    source: args.source,
  });
  return { ok: res.ok, sessionId: sid, reason: res.error as RunIncomingCallAcceptArgs extends never ? never : "duplicate_accept_blocked" | "already_consumed" | "permission_denied" | "patch_failed" | "exception" | undefined };
}

export async function runIncomingCallReject(args: RunIncomingCallRejectArgs): Promise<{
  ok: boolean;
  sessionId: string;
  reason?: "duplicate_reject_blocked" | "patch_failed" | "exception";
}> {
  const sid = args.sessionId.trim();
  const res = await dispatchCallEngineSignal({
    type: "user_reject",
    sessionId: sid,
    source: args.source,
  });
  return {
    ok: res.ok,
    sessionId: sid,
    reason: res.error as "duplicate_reject_blocked" | "patch_failed" | "exception" | undefined,
  };
}
