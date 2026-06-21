"use client";

import { writeTerminalCallRecoverySuppress } from "@/lib/community-messenger/call-active-session-recovery";
import { isTerminalCallRecoveryStatus } from "@/lib/community-messenger/call-active-session-recovery";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import { isCommunityMessengerTempCallSessionId } from "@/lib/community-messenger/call-session-navigation-seed";
import {
  isNativeCalleeAcceptCompletedRoute,
  isNativeCalleeAcceptOwnedRoute,
  readNativeCalleeAcceptRouteParams,
} from "@/lib/community-messenger/native-callee-accept-entry";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type CallRouteResumeDecision =
  | { action: "allow"; session: CommunityMessengerCallSession | null }
  | { action: "block"; reason: string; sessionId: string };

function readSearchFromPath(path: string): URLSearchParams {
  const qIdx = path.indexOf("?");
  const search = qIdx >= 0 ? path.slice(qIdx + 1) : "";
  return new URLSearchParams(search);
}

function isCalleeAcceptResumePath(path: string): boolean {
  const params = readSearchFromPath(path);
  if (params.get("action") === "accept" || params.get("callAction") === "accept") return true;
  return isNativeCalleeAcceptOwnedRoute(readNativeCalleeAcceptRouteParams(params));
}

function isNativeResumeOnlyPath(path: string): boolean {
  const params = readSearchFromPath(path);
  return params.get("source") === "native_resume" && !isCalleeAcceptResumePath(path);
}

async function fetchCallSessionForResumeGuard(
  sessionId: string
): Promise<CommunityMessengerCallSession | null> {
  const sid = sessionId.trim();
  if (!sid) return null;
  const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: CommunityMessengerCallSession | null;
  };
  if (!json.ok || !json.session?.id) return null;
  return json.session;
}

async function suppressStaleOutgoingSession(sessionId: string, source: string): Promise<void> {
  const sid = sessionId.trim();
  if (!sid) return;
  writeTerminalCallRecoverySuppress(sid);
  logDibayCall("stale_ringing_blocked", {
    sessionId: sid,
    callId: sid,
    source,
  });
}

/**
 * 앱 재실행·pending route replay·native resume 전에 통화 라우트 진입 허용 여부.
 * stale 발신 ringing 은 라우팅만 차단한다. recovery 는 remote terminal PATCH 를 보내지 않는다.
 */
export async function resolveCallRouteResumeDecision(args: {
  sessionId: string;
  path: string;
}): Promise<CallRouteResumeDecision> {
  const sid = args.sessionId.trim();
  const path = args.path.trim();
  if (!sid || !path) {
    return { action: "block", reason: "missing_session_or_path", sessionId: sid };
  }

  if (isCommunityMessengerTempCallSessionId(sid)) {
    return { action: "block", reason: "temp_outgoing_shell", sessionId: sid };
  }

  const session = await fetchCallSessionForResumeGuard(sid);
  if (!session) {
    return { action: "block", reason: "session_not_found", sessionId: sid };
  }

  const status = session.status?.trim().toLowerCase() ?? "";
  if (isTerminalCallRecoveryStatus(status)) {
    writeTerminalCallRecoverySuppress(sid);
    return { action: "block", reason: "terminal_session", sessionId: sid };
  }

  if (status === "ringing") {
    if (session.isMineInitiator) {
      await suppressStaleOutgoingSession(sid, "resume_guard_stale_outgoing_ringing");
      return { action: "block", reason: "stale_outgoing_ringing", sessionId: sid };
    }
    if (isNativeResumeOnlyPath(path)) {
      return { action: "block", reason: "ringing_native_resume_blocked", sessionId: sid };
    }
    if (!isCalleeAcceptResumePath(path)) {
      return { action: "block", reason: "ringing_without_accept", sessionId: sid };
    }
  }

  if (isNativeResumeOnlyPath(path) && status !== "active") {
    if (session.isMineInitiator) {
      await suppressStaleOutgoingSession(sid, "resume_guard_stale_outgoing_non_active");
    }
    return { action: "block", reason: "native_resume_not_active", sessionId: sid };
  }

  if (
    isCalleeAcceptResumePath(path) &&
    isNativeCalleeAcceptCompletedRoute(readNativeCalleeAcceptRouteParams(readSearchFromPath(path))) &&
    status === "active"
  ) {
    return { action: "allow", session };
  }

  if (status === "active") {
    return { action: "allow", session };
  }

  if (isCalleeAcceptResumePath(path) && status === "ringing" && !session.isMineInitiator) {
    return { action: "allow", session };
  }

  return { action: "block", reason: "unsupported_resume_state", sessionId: sid };
}
