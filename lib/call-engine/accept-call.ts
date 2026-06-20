"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import {
  fetchCommunityMessengerCallSessionByIdClient,
  patchCommunityMessengerCallSession,
} from "@/lib/community-messenger/call-http-actions";
import {
  releaseIncomingCallAccept,
  tryClaimIncomingCallAccept,
} from "@/lib/community-messenger/incoming-call-action-guard";
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
import { dismissAllIncomingCallNotificationsFireAndForget } from "@/lib/push/native/dismiss-native-incoming-call-notification";
import { isDibayCallConsumed } from "@/lib/community-messenger/incoming-call-state";
import { applyIncomingCallConsumedSideEffects } from "@/lib/community-messenger/incoming-call-consumed-side-effects";
import { joinCallSessionOnce } from "@/lib/call-engine/call-agora-lifecycle";
import { setCallEnginePhase } from "@/lib/call-engine/call-engine-state";
import {
  buildCallEngineAcceptHref,
  getCallEngineRouter,
  type CallEngineRouter,
} from "@/lib/call-engine/call-engine-router";
import { stopCallEngineRing, syncCallEngineRingFromState } from "@/lib/call-engine/call-ring-controller";

export type CallEngineAcceptSource =
  | "incoming_banner"
  | "incoming_banner_accept"
  | "native_pill"
  | "native"
  | "native_notification"
  | "native_notification_accept"
  | "native_activity"
  | "native_activity_accept"
  | "call_client"
  | "call_client_accept"
  | string;

export type AcceptCallOptions = {
  router?: CallEngineRouter;
  skipRouteReplace?: boolean;
  /** Known session — avoids fetch when banner already has it */
  session?: CommunityMessengerCallSession;
  hrefOverride?: string;
};

export type AcceptCallResult = {
  ok: boolean;
  sessionId: string;
  reason?:
    | "duplicate_accept_blocked"
    | "already_consumed"
    | "permission_denied"
    | "patch_failed"
    | "session_fetch_failed"
    | "join_failed"
    | "exception";
};

const patchedAcceptIds = new Set<string>();

export function resetAcceptCallEngineForTests(): void {
  patchedAcceptIds.clear();
}

async function resolveSessionForAccept(
  sessionId: string,
  session?: CommunityMessengerCallSession,
): Promise<CommunityMessengerCallSession | null> {
  if (session?.id.trim() === sessionId) return session;
  return fetchCommunityMessengerCallSessionByIdClient(sessionId);
}

async function navigateToCallScreen(
  sessionId: string,
  router: CallEngineRouter | null,
  hrefOverride?: string,
): Promise<void> {
  const href = hrefOverride?.trim() || buildCallEngineAcceptHref(sessionId);
  logDibayCall("engine_active_route_replace", { sessionId, callId: sessionId, href });
  if (router) {
    router.replace(href);
    return;
  }
  const globalRouter = getCallEngineRouter();
  if (globalRouter) {
    globalRouter.replace(href);
    return;
  }
  if (typeof window !== "undefined") {
    window.history.replaceState(null, "", href);
  }
}

/**
 * 앱 전역 유일 accept — PATCH accept 1회, ring stop, route, Agora join 1회.
 */
export async function acceptCall(
  sessionId: string,
  source: CallEngineAcceptSource,
  options: AcceptCallOptions = {},
): Promise<AcceptCallResult> {
  const sid = sessionId.trim();
  if (!sid) return { ok: false, sessionId: "", reason: "exception" };

  logDibayCall("engine_accept_start", { sessionId: sid, callId: sid, source });

  const liveCallId = getActiveCallSessionCallId();
  if (liveCallId && liveCallId !== sid) {
    return { ok: false, sessionId: sid, reason: "duplicate_accept_blocked" };
  }

  stopCallEngineRing(sid, "accept_pressed_immediate");
  dismissAllIncomingCallNotificationsFireAndForget(sid);

  if (isDibayCallConsumed(sid)) {
    return { ok: false, sessionId: sid, reason: "already_consumed" };
  }

  unlockCommunityMessengerCallPlaybackFromUserGesture();
  rememberCallNavigationReturnPath();

  if (!tryClaimIncomingCallAccept(sid)) {
    return { ok: false, sessionId: sid, reason: "duplicate_accept_blocked" };
  }

  try {
    const session = await resolveSessionForAccept(sid, options.session);
    if (!session) {
      return { ok: false, sessionId: sid, reason: "session_fetch_failed" };
    }

    writeCallAcceptHydratePeerFromSession(session, source);
    primeCommunityMessengerCallNavigationSeed(sid, session);
    primeCommunityMessengerCallConnectionPrefetch(sid);

    let patchedSession = session;
    const alreadyActive = session.status === "active";
    const alreadyPatched = patchedAcceptIds.has(sid);

    if (!alreadyActive && !alreadyPatched) {
      const patched = await patchCommunityMessengerCallSession(sid, "accept", undefined, {
        sessionStatus: session.status,
        isInitiator: session.isMineInitiator,
        endedReason: session.endedReason ?? null,
      });
      if (!patched.ok || !patched.session) {
        return { ok: false, sessionId: sid, reason: "patch_failed" };
      }
      patchedAcceptIds.add(sid);
      logDibayCall("engine_accept_patch", { sessionId: sid, callId: sid, source, patchCount: 1 });
      patchedSession = patched.session;
    } else {
      logDibayCall("engine_accept_patch_skipped", {
        sessionId: sid,
        callId: sid,
        source,
        reason: alreadyActive ? "already_active" : "already_patched",
      });
    }

    applyIncomingCallConsumedSideEffects(sid, "accepted", source);
    writeCallAcceptHydratePeerFromSession(patchedSession, "engine_accept_patch_ok");
    primeCommunityMessengerCallNavigationSeed(patchedSession.id, patchedSession);

    const activePhase = mapSessionStatusToActiveCallPhase(patchedSession, false);
    if (activePhase !== "idle") {
      setActiveCallSession(
        {
          callId: patchedSession.id,
          roomId: patchedSession.roomId,
          peerUserId: patchedSession.peerUserId,
          role: "callee",
          mediaType: patchedSession.callKind,
          phase: activePhase,
        },
        "engine_accept",
      );
    }

    setCallEnginePhase({
      phase: "connecting",
      sessionId: sid,
      role: "callee",
      callKind: patchedSession.callKind,
      source,
    });
    syncCallEngineRingFromState();

    if (!options.skipRouteReplace) {
      await navigateToCallScreen(sid, options.router ?? null, options.hrefOverride);
    }

    const joined = await joinCallSessionOnce(patchedSession);
    if (joined) {
      setCallEnginePhase({
        phase: "connected",
        sessionId: sid,
        role: "callee",
        callKind: patchedSession.callKind,
        source,
      });
      syncCallEngineRingFromState();
    }

    logDibayCall("engine_accept_success", { sessionId: sid, callId: sid, source, joined });
    return joined
      ? { ok: true, sessionId: sid }
      : { ok: false, sessionId: sid, reason: "join_failed" };
  } catch {
    return { ok: false, sessionId: sid, reason: "exception" };
  } finally {
    releaseIncomingCallAccept(sid);
  }
}
