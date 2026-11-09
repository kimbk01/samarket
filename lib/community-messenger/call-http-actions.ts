/**
 * 웹 클라이언트 — 통화 세션 HTTP 액션 (HTTPS 운영 기준, credentials 포함).
 * 네이티브는 동일 엔드포인트·페이로드를 재사용.
 */

import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";
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
  | "connected"
  | "upgrade_to_video"
  | "downgrade_to_voice";

export async function patchCommunityMessengerCallSession(
  sessionId: string,
  action: PatchCommunityCallSessionAction,
  init?: { durationSeconds?: number; clientEndedReason?: string; deviceId?: string },
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
  let deviceId = typeof init?.deviceId === "string" ? init.deviceId.trim() : "";
  if (!deviceId && typeof window !== "undefined") {
    // Sync resolve — pagehide keepalive must start fetch before unload kills the tab.
    // Do not await dynamic import here (breaks leave teardown + dual fetch contract).
    try {
      deviceId = ensureClientInstanceId();
    } catch {
      deviceId = "";
    }
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
      ...(deviceId ? { deviceId } : {}),
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
  /** 방 ID. 방이 없는 상대는 `PEER_DIRECT_CALL_ROOM_SEGMENT` + `peerUserId` (R5 — 방 확보·통화 생성 1회 요청) */
  roomId: string;
  peerUserId?: string | null;
  callKind: "voice" | "video";
  /** §15-4 발신 시도 ID(UUID) — 서버가 통화와 묶어 시도 취소·재시도 멱등에 쓴다. */
  clientAttemptId?: string | null;
}): Promise<{
  ok: boolean;
  session?: CommunityMessengerCallSession;
  error?: string;
  /** R5 — `by-peer` 요청에서 서버가 확보한 1:1 방 ID (통화 생성 실패여도 방이 확보됐으면 포함) */
  roomId?: string;
  /** R5 — `by-peer` 요청에서 방 확보 자체가 실패 */
  roomError?: boolean;
  /** E-C1 — API `error` stays `peer_busy`; distinguishes peer vs dialer live */
  busyKind?: "peer" | "caller";
  busyRecord?: { sessionId?: string; callLogId?: string | null };
  /** 서버 응답 코드 — 5xx 면 서버가 통화를 만들었는지 알 수 없다(§15-4 시도 취소 판단). */
  httpStatus?: number;
}> {
  const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(input.roomId)}/calls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      callKind: input.callKind,
      dialIntent: "fresh",
      ...(input.clientAttemptId ? { clientAttemptId: input.clientAttemptId } : {}),
      ...(input.peerUserId?.trim() ? { peerUserId: input.peerUserId.trim() } : {}),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: CommunityMessengerCallSession;
    error?: string;
    roomId?: string;
    roomError?: boolean;
    busyKind?: "peer" | "caller";
    busyRecord?: { sessionId?: string; callLogId?: string | null };
  };
  return { ...json, ok: Boolean(res.ok && json.ok), httpStatus: res.status };
}

/**
 * §15-4 발신 시도 취소 — 멱등. 네트워크 오류·5xx 는 짧게 다시 시도한다(이 요청이 빠지면 상대가 시간 제한까지 울린다).
 * `keepalive` — 페이지가 닫히는 중에도 요청이 끝나도록.
 */
export async function cancelCommunityMessengerCallAttempt(
  clientAttemptId: string
): Promise<{ ok: boolean; sessionId?: string | null; status?: string | null; error?: string }> {
  const id = clientAttemptId.trim();
  if (!id) return { ok: false, error: "bad_attempt_id" };
  const delays = [0, 1_000, 3_000];
  let last: { ok: boolean; sessionId?: string | null; status?: string | null; error?: string } = {
    ok: false,
    error: "network_error",
  };
  for (const delay of delays) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const res = await fetch(
        `/api/community-messenger/calls/attempts/${encodeURIComponent(id)}/cancel`,
        { method: "POST", credentials: "include", keepalive: true }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sessionId?: string | null;
        status?: string | null;
        error?: string;
      };
      last = { ...json, ok: Boolean(res.ok && json.ok) };
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) return last;
    } catch {
      last = { ok: false, error: "network_error" };
    }
  }
  return last;
}
