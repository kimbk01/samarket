import { evaluateIncomingCallBusyPolicy } from "@/lib/call/call-state";
import {
  canShowIncoming,
  type CallTerminalTombstoneContext,
} from "@/lib/community-messenger/call-state/call-terminal-tombstone";
import { isRingingIncomingOverlayCandidate } from "@/lib/community-messenger/call-incoming-terminal";
import {
  extractCommunityMessengerCallRouteSessionId,
  resolveIncomingCallSurface,
  resolveOverlayBusyLiveSessionId,
  shouldHideGlobalIncomingOverlayForSession,
} from "@/lib/community-messenger/incoming-call-surface";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type ForegroundIncomingPresenterSurface = "none" | "top-banner";

export type ForegroundIncomingPresenterDecision = {
  sessionId: string | null;
  session: CommunityMessengerCallSession | null;
  surface: ForegroundIncomingPresenterSurface;
  reason: string;
  shouldRender: boolean;
  /** busy 필터 후 선택된 ringing (배너 미표시여도 diagnostics 용) */
  selectedRingingSessionId: string | null;
};

export type ForegroundIncomingPresenterInput = {
  sessions: CommunityMessengerCallSession[];
  pathname: string | null | undefined;
  routeCallId?: string | null;
  viewerUserId: string | null | undefined;
  viewerLiveSessionId: string | null | undefined;
  tombstone: CallTerminalTombstoneContext;
  incomingTabLeader: boolean;
  visibilityState?: "visible" | "hidden" | "prerender" | "unloaded" | null;
  isAppForeground?: boolean;
};

function emptyDecision(reason: string): ForegroundIncomingPresenterDecision {
  return {
    sessionId: null,
    session: null,
    surface: "none",
    reason,
    shouldRender: false,
    selectedRingingSessionId: null,
  };
}

function collectBusyFilteredRingingCandidates(
  sessions: CommunityMessengerCallSession[],
  uid: string,
  pathname: string | null | undefined,
  viewerLiveSessionId: string | null | undefined
): CommunityMessengerCallSession[] {
  const candidates: CommunityMessengerCallSession[] = [];
  for (const s of sessions) {
    if (s.status !== "ringing") continue;
    if (s.endedAt || s.cancelledAt) continue;
    if (!isRingingIncomingOverlayCandidate(s, uid)) continue;
    const busy = evaluateIncomingCallBusyPolicy({
      incoming: s,
      otherLiveSessionId: resolveOverlayBusyLiveSessionId({
        viewerLiveSessionId,
        pathname,
        incomingSessionId: s.id,
      }),
    });
    if (busy.shouldAutoReject) continue;
    candidates.push(s);
  }
  return candidates;
}

function pickPreferredRingingCandidate(
  candidates: CommunityMessengerCallSession[],
  pathname: string | null | undefined
): CommunityMessengerCallSession | null {
  if (candidates.length === 0) return null;
  for (const s of candidates) {
    if (!shouldHideGlobalIncomingOverlayForSession(pathname, s.id)) return s;
  }
  return candidates[0] ?? null;
}

/**
 * Foreground in-app 수신 배너 단일 결정 — Global 에 정책을 누적하지 않는다.
 */
export function resolveForegroundIncomingPresentation(
  input: ForegroundIncomingPresenterInput
): ForegroundIncomingPresenterDecision {
  const uid = input.viewerUserId?.trim() ?? "";
  if (!uid) return emptyDecision("no_user_id");
  if (!input.incomingTabLeader) return emptyDecision("incoming_tab_leader_false");

  const pathname = input.pathname;
  const routeCallId =
    input.routeCallId ?? extractCommunityMessengerCallRouteSessionId(pathname);

  const candidates = collectBusyFilteredRingingCandidates(
    input.sessions,
    uid,
    pathname,
    input.viewerLiveSessionId
  );
  if (candidates.length === 0) {
    const ringing = input.sessions.filter(
      (s) => s.status === "ringing" && !s.endedAt && !s.cancelledAt
    );
    for (const s of ringing) {
      if (!isRingingIncomingOverlayCandidate(s, uid)) continue;
      const busy = evaluateIncomingCallBusyPolicy({
        incoming: s,
        otherLiveSessionId: resolveOverlayBusyLiveSessionId({
          viewerLiveSessionId: input.viewerLiveSessionId,
          pathname,
          incomingSessionId: s.id,
        }),
      });
      if (busy.shouldAutoReject) {
        return {
          ...emptyDecision(`busy_auto_reject:${s.id}:liveSession=${input.viewerLiveSessionId ?? "null"}`),
          selectedRingingSessionId: null,
        };
      }
    }
    return emptyDecision("no_ringing_candidate");
  }

  const session = pickPreferredRingingCandidate(candidates, pathname);
  if (!session) return emptyDecision("no_ringing_candidate");

  const selectedRingingSessionId = session.id;

  if (shouldHideGlobalIncomingOverlayForSession(pathname, session.id)) {
    return {
      sessionId: session.id,
      session,
      surface: "none",
      reason: `hidden_same_call_route:route=${routeCallId ?? "null"}:incoming=${session.id}`,
      shouldRender: false,
      selectedRingingSessionId,
    };
  }

  if (!canShowIncoming(session.id, input.tombstone)) {
    return {
      sessionId: session.id,
      session,
      surface: "none",
      reason: "can_show_incoming_false",
      shouldRender: false,
      selectedRingingSessionId,
    };
  }

  const visibilityState = input.visibilityState ?? "visible";
  const isAppForeground = input.isAppForeground ?? visibilityState === "visible";
  const resolvedSurface = resolveIncomingCallSurface({
    visibilityState,
    currentPathname: pathname,
    isAppForeground,
    sessionStatus: session.status,
    callKind: session.callKind,
    incomingSessionId: session.id,
  });

  if (resolvedSurface !== "top-banner") {
    return {
      sessionId: session.id,
      session,
      surface: "none",
      reason: `incoming_surface_not_banner:${resolvedSurface}`,
      shouldRender: false,
      selectedRingingSessionId,
    };
  }

  return {
    sessionId: session.id,
    session,
    surface: "top-banner",
    reason: "ok",
    shouldRender: true,
    selectedRingingSessionId,
  };
}
