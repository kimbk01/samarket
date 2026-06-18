import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import {
  canShowIncoming,
  isCallTerminal,
  type CallTerminalTombstoneContext,
} from "@/lib/community-messenger/call-state/call-terminal-tombstone";
import { buildCallTombstoneContext } from "@/lib/community-messenger/call-events/fcm-call-event-normalizer";
import { evaluateIncomingCallBusyPolicy } from "@/lib/call/call-state";
import { isRingingIncomingOverlayCandidate } from "@/lib/community-messenger/call-incoming-terminal";
import {
  extractCommunityMessengerCallRouteSessionId,
  isCommunityMessengerCallSurfacePath,
  resolveOverlayBusyLiveSessionId,
  shouldHideGlobalIncomingOverlayForSession,
  type IncomingCallSurface,
} from "@/lib/community-messenger/incoming-call-surface";
import { isDibayCallConsumed } from "@/lib/community-messenger/incoming-call-state";

export type IncomingPresenterDecisionInput = {
  pathname: string | null | undefined;
  userId: string | null | undefined;
  incomingTabLeader: boolean;
  incomingTabLeaderRaw: boolean;
  incomingVisibilityState: string;
  isCapacitorNative: boolean;
  sessions: CommunityMessengerCallSession[];
  viewerLiveSessionId: string | null;
  firstRingingCalleeSession: CommunityMessengerCallSession | null;
  directRingingCalleeSession: CommunityMessengerCallSession | null;
  visibleSession: CommunityMessengerCallSession | null;
  incomingSurface: IncomingCallSurface | null;
  renderIncomingBanner: boolean;
  hardClearedAt: Map<string, number>;
};

export type IncomingPresenterDecisionPayload = {
  callId: string | null;
  pathname: string | null;
  routeCallId: string | null;
  isDedicatedCallRoute: boolean;
  shouldHideForSameCallRoute: boolean;
  incomingTabLeader: boolean;
  incomingTabLeaderRaw: boolean;
  firstRingingCalleeSessionId: string | null;
  directRingingCalleeSessionId: string | null;
  visibleSessionId: string | null;
  incomingSurface: IncomingCallSurface | null;
  renderIncomingBanner: boolean;
  renderIncomingFullScreen: boolean;
  canShowIncoming: boolean | null;
  isConsumed: boolean | null;
  isTerminal: boolean | null;
  visibilityState: string;
  appVisibleProxy: boolean;
  busyPolicyShouldAutoReject: boolean | null;
  viewerLiveSessionId: string | null;
  sessionsCount: number;
  reason: string;
  ringingSessionIds: string[];
  firstRingingSkipDetail: string | null;
};

function diagnoseFirstRingingCalleeNull(
  sessions: CommunityMessengerCallSession[],
  uid: string,
  viewerLiveSessionId: string | null,
  pathname: string | null | undefined
): string {
  const ringing = sessions.filter(
    (s) => s.status === "ringing" && !s.endedAt && !s.cancelledAt
  );
  if (ringing.length === 0) return "no_ringing_in_sessions";

  for (const s of ringing) {
    if (!isRingingIncomingOverlayCandidate(s, uid)) {
      return `overlay_candidate_rejected:${s.id}:mode=${s.sessionMode}:mineInitiator=${s.isMineInitiator}`;
    }
    const busy = evaluateIncomingCallBusyPolicy({
      incoming: s,
      otherLiveSessionId: resolveOverlayBusyLiveSessionId({
        viewerLiveSessionId,
        pathname,
        incomingSessionId: s.id,
      }),
    });
    if (busy.shouldAutoReject) {
      return `busy_auto_reject:${s.id}:liveSession=${viewerLiveSessionId ?? "null"}`;
    }
  }
  return "first_ringing_callee_unknown";
}

export function buildIncomingPresenterDecisionPayload(
  input: IncomingPresenterDecisionInput
): IncomingPresenterDecisionPayload {
  const pathname =
    typeof input.pathname === "string" && input.pathname.trim() ? input.pathname : null;
  const routeCallId = extractCommunityMessengerCallRouteSessionId(pathname);
  const isDedicatedCallRoute = isCommunityMessengerCallSurfacePath(pathname);
  const firstRingingCalleeSessionId = input.firstRingingCalleeSession?.id ?? null;
  const directRingingCalleeSessionId = input.directRingingCalleeSession?.id ?? null;
  const visibleSessionId = input.visibleSession?.id ?? null;
  const shouldHideForSameCallRoute = firstRingingCalleeSessionId
    ? shouldHideGlobalIncomingOverlayForSession(pathname, firstRingingCalleeSessionId)
    : false;

  const callId =
    directRingingCalleeSessionId ??
    firstRingingCalleeSessionId ??
    input.sessions.find((s) => s.status === "ringing")?.id ??
    null;

  const tombstone: CallTerminalTombstoneContext = buildCallTombstoneContext(input.hardClearedAt);
  const canShow = callId ? canShowIncoming(callId, tombstone) : null;
  const isConsumed = callId ? isDibayCallConsumed(callId) : null;
  const isTerminal = callId ? isCallTerminal(callId, tombstone) : null;

  const uid = input.userId?.trim() ?? "";
  const firstRingingSkipDetail =
    !input.firstRingingCalleeSession && uid
      ? diagnoseFirstRingingCalleeNull(
          input.sessions,
          uid,
          input.viewerLiveSessionId,
          pathname
        )
      : null;

  const busyPolicyTargetSession =
    input.sessions.find((s) => s.id === callId && s.status === "ringing") ??
    input.directRingingCalleeSession ??
    input.firstRingingCalleeSession ??
    null;
  const busyPolicyShouldAutoReject = busyPolicyTargetSession
    ? evaluateIncomingCallBusyPolicy({
        incoming: busyPolicyTargetSession,
        otherLiveSessionId: resolveOverlayBusyLiveSessionId({
          viewerLiveSessionId: input.viewerLiveSessionId,
          pathname,
          incomingSessionId: busyPolicyTargetSession.id,
        }),
      }).shouldAutoReject
    : null;

  let reason: string;
  if (!uid) {
    reason = "no_user_id";
  } else if (!input.incomingTabLeader && !input.isCapacitorNative) {
    reason = "incoming_tab_leader_false";
  } else if (!input.firstRingingCalleeSession) {
    reason = firstRingingSkipDetail ?? "first_ringing_callee_null";
  } else if (shouldHideForSameCallRoute) {
    reason = `hide_same_call_route:route=${routeCallId}:incoming=${firstRingingCalleeSessionId}`;
  } else if (!input.visibleSession) {
    reason = "visible_session_null_unexpected";
  } else if (input.incomingSurface !== "top-banner") {
    reason = `incoming_surface_not_banner:${input.incomingSurface ?? "null"}`;
  } else if (!input.renderIncomingBanner) {
    reason = "render_incoming_banner_false";
  } else if (canShow === false) {
    reason = "can_show_incoming_false";
  } else {
    reason = "ok";
  }

  return {
    callId,
    pathname,
    routeCallId,
    isDedicatedCallRoute,
    shouldHideForSameCallRoute,
    incomingTabLeader: input.incomingTabLeader,
    incomingTabLeaderRaw: input.incomingTabLeaderRaw,
    firstRingingCalleeSessionId,
    directRingingCalleeSessionId,
    visibleSessionId,
    incomingSurface: input.incomingSurface,
    renderIncomingBanner: input.renderIncomingBanner,
    renderIncomingFullScreen: false,
    canShowIncoming: canShow,
    isConsumed,
    isTerminal,
    visibilityState: input.incomingVisibilityState,
    appVisibleProxy: input.incomingVisibilityState === "visible",
    busyPolicyShouldAutoReject,
    viewerLiveSessionId: input.viewerLiveSessionId,
    sessionsCount: input.sessions.length,
    reason,
    ringingSessionIds: input.sessions
      .filter((s) => s.status === "ringing")
      .map((s) => s.id),
    firstRingingSkipDetail,
  };
}

/** Dedup 없음 — presenter 진단용 단일 라인 logcat grep. */
export function logIncomingPresenterDecision(payload: IncomingPresenterDecisionPayload): void {
  if (typeof window === "undefined") return;
  console.info(`[DIBAY_CALL] incoming_presenter_decision ${JSON.stringify(payload)}`);
}
