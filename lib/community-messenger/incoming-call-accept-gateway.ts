"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { ensureCallMediaForUserGesture } from "@/lib/community-messenger/call-media-permission-preflight";
import { patchCommunityMessengerCallSession } from "@/lib/community-messenger/call-http-actions";
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
import { unlockCommunityMessengerCallPlaybackFromUserGesture } from "@/lib/community-messenger/call-feedback-sound";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import { dibayIncomingLaneStopRing } from "@/lib/community-messenger/call-lifecycle";
import { dismissAllIncomingCallNotificationsFireAndForget } from "@/lib/push/native/dismiss-native-incoming-call-notification";

export type IncomingCallGatewayRouter = {
  replace: (href: string) => void;
};

export type RunIncomingCallAcceptArgs = {
  session: CommunityMessengerCallSession;
  router: IncomingCallGatewayRouter;
  source:
    | "incoming_banner_accept"
    | "incoming_banner_expand"
    | "incoming_overlay_accept"
    | "call_client_accept"
    | "call_client_hydrate_accept";
};

export type RunIncomingCallRejectArgs = {
  sessionId: string;
  source:
    | "incoming_banner_reject"
    | "incoming_overlay_reject"
    | "call_client_reject"
    | "call_client_hydrate_reject";
};

/**
 * 단일 수신 수락 게이트웨이.
 *
 * 계약:
 * - in-flight 이면 silent return 하지 않는다(호출부가 connecting UI/disabled 를 유지해야 함).
 * - 성공 시 `/calls/:id?action=accept&nativeAccept=1` 로만 이동한다.
 * - `nativeAccept=1` 은 \"accept PATCH 완료\" 의미이며, CallClient 는 이를 보고 PATCH 를 재실행하면 안 된다.
 */
export async function runIncomingCallAccept(args: RunIncomingCallAcceptArgs): Promise<{
  ok: boolean;
  sessionId: string;
  reason?: "duplicate_accept_blocked" | "permission_denied" | "patch_failed" | "exception";
}> {
  const s = args.session;
  const sid = s.id.trim();
  if (!sid) return { ok: false, sessionId: "", reason: "exception" };

  logDibayCall("incoming_accept_click", { sessionId: sid, source: args.source });
  unlockCommunityMessengerCallPlaybackFromUserGesture();
  rememberCallNavigationReturnPath();
  primeCommunityMessengerCallNavigationSeed(sid, s);

  if (!tryClaimIncomingCallAccept(sid)) {
    logDibayCall("accept_failed", { sessionId: sid, source: args.source, reason: "duplicate_accept_blocked" });
    return { ok: false, sessionId: sid, reason: "duplicate_accept_blocked" };
  }

  try {
    logDibayCall("accept_start", { sessionId: sid, source: args.source });
    dibayIncomingLaneStopRing("accept_gateway_start", sid);
    dismissAllIncomingCallNotificationsFireAndForget(sid);

    const permission = await ensureCallMediaForUserGesture(s.callKind);
    if (!permission.ok) {
      logDibayCall("accept_failed", { sessionId: sid, source: args.source, reason: "permission_denied" });
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
      logDibayCall("accept_failed", { sessionId: sid, source: args.source, reason: "patch_failed" });
      return { ok: false, sessionId: sid, reason: "patch_failed" };
    }

    markNativeCalleeAcceptPending(sid);
    logDibayCall("accept_success", { sessionId: sid, source: args.source });

    const href = `/community-messenger/calls/${encodeURIComponent(sid)}?action=accept&nativeAccept=1`;
    logDibayCall("call_route_open_start", { sessionId: sid, href, source: args.source });
    args.router.replace(href);
    logDibayCall("call_route_open_done", { sessionId: sid, href, source: args.source });
    return { ok: true, sessionId: sid };
  } catch {
    logDibayCall("call_route_open_failed", { sessionId: sid, source: args.source });
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
    return { ok: true, sessionId: sid };
  } catch {
    return { ok: false, sessionId: sid, reason: "exception" };
  } finally {
    releaseIncomingCallReject(sid);
  }
}

