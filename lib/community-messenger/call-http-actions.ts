/**
 * 웹 클라이언트 — 통화 세션 HTTP 액션 (HTTPS 운영 기준, credentials 포함).
 * 네이티브는 동일 엔드포인트·페이로드를 재사용.
 */

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

/** `patchCommunityMessengerCallSession` · 세션 PATCH fetch 직후 개발 전용 디버그에만 사용 */
export type CommunityMessengerCallSessionPatchDebugContext = {
  sessionStatus?: string;
  isInitiator?: boolean;
  endedReason?: string | null;
};

/**
 * 개발 서버에서만 — 통화 세션 PATCH 응답 추적(400 원인 등). 프로덕션 번들에서는 호출부가 noop 에 가깝게 트리 미닝된다.
 */
export function logCommunityMessengerCallSessionPatchDev(input: {
  sessionId: string;
  action: string;
  responseStatus: number;
  responseBody: unknown;
  context?: CommunityMessengerCallSessionPatchDebugContext;
}): void {
  if (process.env.NODE_ENV !== "development") return;
  const ctx = input.context;
  const body = input.responseBody as { error?: string } | null;
  const responseError =
    body && typeof body === "object" && typeof body.error === "string" ? body.error.trim() : "";
  const bodySession = input.responseBody as { session?: { status?: string } } | null;
  const responseSessionStatus =
    bodySession && typeof bodySession.session === "object" && bodySession.session
      ? String(bodySession.session.status ?? "")
      : undefined;
  console.debug("[cm-call-session:PATCH]", {
    sessionId: input.sessionId,
    action: input.action,
    /** 요청 직전 클라 스냅샷(혼동 주의) */
    preRequestSessionStatus: ctx?.sessionStatus,
    /** 서버가 돌려준 최종 세션 상태 */
    responseSessionStatus: responseSessionStatus || undefined,
    isCaller: ctx?.isInitiator === true,
    isCallee: ctx?.isInitiator === false,
    endedReason: ctx?.endedReason ?? null,
    responseStatus: input.responseStatus,
    responseError: responseError || undefined,
  });
}

export type PatchCommunityCallSessionAction =
  | "accept"
  | "reject"
  | "cancel"
  | "end"
  | "leave"
  | "missed"
  | "upgrade_to_video"
  | "downgrade_to_voice";

export async function patchCommunityMessengerCallSession(
  sessionId: string,
  action: PatchCommunityCallSessionAction,
  init?: { durationSeconds?: number; clientEndedReason?: string },
  debugContext?: CommunityMessengerCallSessionPatchDebugContext
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  if (process.env.NODE_ENV === "development" && typeof performance !== "undefined") {
    console.debug("[cm-call-audio-cleanup]", {
      step: "patch_fetch_start",
      action,
      sessionIdSuffix: sessionId.slice(-8),
      t: performance.now(),
    });
  }
  const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action,
      ...(init?.durationSeconds != null ? { durationSeconds: init.durationSeconds } : {}),
      ...(init?.clientEndedReason != null && init.clientEndedReason !== ""
        ? { clientEndedReason: init.clientEndedReason }
        : {}),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: CommunityMessengerCallSession;
    error?: string;
  };
  logCommunityMessengerCallSessionPatchDev({
    sessionId,
    action,
    responseStatus: res.status,
    responseBody: json,
    context: debugContext,
  });
  return { ...json, ok: Boolean(res.ok && json.ok) };
}

/** Native pending accept · gateway PATCH 전 세션 hydrate */
export async function fetchCommunityMessengerCallSessionByIdClient(
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
    session?: CommunityMessengerCallSession;
  };
  return json.session ?? null;
}

export async function postCommunityMessengerCallHangupSignal(input: {
  sessionId: string;
  toUserId: string;
  reason?: string;
}): Promise<void> {
  await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(input.sessionId)}/signals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      toUserId: input.toUserId,
      signalType: "hangup",
      payload: { reason: input.reason ?? "hangup" },
    }),
  });
}

export async function startCommunityMessengerRoomCall(input: {
  roomId: string;
  callKind: "voice" | "video";
}): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(input.roomId)}/calls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ callKind: input.callKind, dialIntent: "fresh" }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: CommunityMessengerCallSession;
    error?: string;
  };
  return { ...json, ok: Boolean(res.ok && json.ok) };
}
