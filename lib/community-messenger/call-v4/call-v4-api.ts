/**
 * V4 HTTP facade — shared call session APIs only (no V3 imports).
 */

import {
  fetchCommunityMessengerCallSessionByIdClient,
  patchCommunityMessengerCallSession,
  startCommunityMessengerRoomCall,
  cancelCommunityMessengerCallAttempt,
} from "@/lib/community-messenger/call-http-actions";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { readCallV4Identity } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CommunityMessengerCallKind, CommunityMessengerCallSession, CommunityMessengerManagedCallConnection } from "@/lib/community-messenger/types";

export type CallV4MediaType = "audio" | "video";

export function callV4MediaTypeFromKind(kind: CommunityMessengerCallKind): CallV4MediaType {
  return kind === "video" ? "video" : "audio";
}

export async function callV4ReconcileBeforeCreate(): Promise<void> {
  await fetch("/api/community-messenger/calls/sessions/active", {
    credentials: "include",
    cache: "no-store",
  }).catch(() => undefined);
}

export type CallV4CallerPollFetchResult = {
  session: CommunityMessengerCallSession | null;
  httpStatus: number;
  notFound: boolean;
};

export async function callV4FetchSessionForCallerPoll(
  callId: string
): Promise<CallV4CallerPollFetchResult> {
  const sid = callId.trim();
  if (!sid) {
    return { session: null, httpStatus: 0, notFound: false };
  }
  const res = await fetch(
    `/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}?ts=${Date.now()}`,
    {
      credentials: "include",
      cache: "no-store",
      headers: {
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
      },
    }
  );
  if (res.status === 404) {
    return { session: null, httpStatus: 404, notFound: true };
  }
  if (!res.ok) {
    return { session: null, httpStatus: res.status, notFound: false };
  }
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: CommunityMessengerCallSession;
  };
  return {
    session: json.session ?? null,
    httpStatus: res.status,
    notFound: false,
  };
}

export async function callV4CreateSession(input: {
  roomId: string;
  /** R5 — roomId 가 `PEER_DIRECT_CALL_ROOM_SEGMENT` 일 때 서버가 이 상대와의 1:1 방을 확보 */
  peerUserId?: string | null;
  mediaType: CallV4MediaType;
  /** §15-4 발신 시도 ID */
  clientAttemptId?: string | null;
}): Promise<{
  ok: boolean;
  session?: CommunityMessengerCallSession;
  error?: string;
  /** R5 — 서버가 확보한 방 ID(by-peer) */
  roomId?: string;
  /** R5 — 방 확보 자체 실패(by-peer) */
  roomError?: boolean;
  busyKind?: "peer" | "caller";
  busyRecord?: { sessionId?: string; callLogId?: string | null };
  httpStatus?: number;
}> {
  const callKind = input.mediaType === "video" ? "video" : "voice";
  logCallV4("create_start", { roomId: input.roomId, mediaType: input.mediaType });
  const result = await startCommunityMessengerRoomCall({
    roomId: input.roomId,
    peerUserId: input.peerUserId ?? null,
    callKind,
    clientAttemptId: input.clientAttemptId ?? null,
  });
  if (result.ok && result.session?.id) {
    logCallV4("create_done", { callId: result.session.id, roomId: input.roomId });
  }
  return result;
}

/** §15-4 발신 시도 취소 — 연결 전에 그만둔 시도를 서버에 알린다(멱등). */
export async function callV4CancelAttempt(
  attemptId: string,
  reason: string
): Promise<{ ok: boolean; sessionId?: string | null; status?: string | null; error?: string }> {
  logCallV4("attempt_cancel_start", { attemptId, reason });
  const result = await cancelCommunityMessengerCallAttempt(attemptId);
  logCallV4("attempt_cancel_done", {
    attemptId,
    reason,
    ok: result.ok,
    callId: result.sessionId ?? null,
    status: result.status ?? null,
    error: result.error ?? null,
  });
  return result;
}

export async function callV4PatchCancel(
  callId: string
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  logCallV4("cancel_patch_start", { callId });
  const result = await patchCommunityMessengerCallSession(callId, "cancel");
  if (result.ok) {
    logCallV4("cancel_patch_done", { callId });
  }
  return result;
}

export async function callV4FetchSession(
  callId: string
): Promise<CommunityMessengerCallSession | null> {
  return fetchCommunityMessengerCallSessionByIdClient(callId);
}

/**
 * F1 (docs/audit/f1-f2-call-incoming-design-2026-11-09.md §F1-6) — 수신 목록 조회 결과.
 * HTTP 오류·본문 오류를 「수신 없음(빈 목록)」과 구분한다. 네트워크 예외(fetch 거부)는 그대로 throw.
 * - ok: 200 + `{ ok: true, sessions }` (sessions 없으면 [] — 기존과 동일)
 * - auth: 401 (로그인 필요)
 * - forbidden: 403 (proxy 차단·탈퇴 회원 읽기 거부 등)
 * - rate_limited: 429 — `Retry-After`(초 또는 HTTP 날짜)를 ms 로. 없거나 읽을 수 없으면 null
 * - server: 5xx
 * - bad_response: 그 밖의 비정상 상태(4xx 등) · 200 본문 JSON 실패 · `ok:false` · sessions 가 배열이 아님
 */
export type CallV4IncomingFetchOutcome =
  | { kind: "ok"; sessions: CommunityMessengerCallSession[] }
  | { kind: "auth"; status: number }
  | { kind: "forbidden"; status: number }
  | { kind: "rate_limited"; status: number; retryAfterMs: number | null }
  | { kind: "server"; status: number }
  | {
      kind: "bad_response";
      status: number;
      reason: "http_status" | "ok_false" | "invalid_json" | "invalid_sessions";
    };

/** `Retry-After` — delta-seconds 또는 HTTP-date (RFC 9110 §10.2.3). 읽을 수 없으면 null. */
export function parseCallV4RetryAfterMs(
  value: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const sec = Number(raw);
    return Number.isFinite(sec) ? sec * 1000 : null;
  }
  /** HTTP-date 는 요일·월 이름(영문)을 포함한다 — 「-5」 같은 값은 Date.parse 가 연도로 읽으므로 거부 */
  if (!/[a-z]/i.test(raw)) return null;
  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, at - nowMs);
}

export async function callV4FetchIncomingSessionsOutcome(): Promise<CallV4IncomingFetchOutcome> {
  const res = await fetch("/api/community-messenger/calls/sessions/incoming?directOnly=1", {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) return { kind: "auth", status: res.status };
  if (res.status === 403) return { kind: "forbidden", status: res.status };
  if (res.status === 429) {
    return {
      kind: "rate_limited",
      status: res.status,
      retryAfterMs: parseCallV4RetryAfterMs(res.headers?.get?.("Retry-After") ?? null),
    };
  }
  if (res.status >= 500) return { kind: "server", status: res.status };
  if (!res.ok) return { kind: "bad_response", status: res.status, reason: "http_status" };
  let json: { ok?: unknown; sessions?: unknown } | null;
  try {
    json = (await res.json()) as { ok?: unknown; sessions?: unknown } | null;
  } catch {
    return { kind: "bad_response", status: res.status, reason: "invalid_json" };
  }
  if (!json || typeof json !== "object" || json.ok !== true) {
    return { kind: "bad_response", status: res.status, reason: "ok_false" };
  }
  const sessions = json.sessions ?? [];
  if (!Array.isArray(sessions)) {
    return { kind: "bad_response", status: res.status, reason: "invalid_sessions" };
  }
  return { kind: "ok", sessions: sessions as CommunityMessengerCallSession[] };
}

/** 목록만 필요한 호출자용(오류 = 빈 목록). 수신 조회 루프는 `callV4FetchIncomingSessionsOutcome` 을 쓴다. */
export async function callV4FetchIncomingSessions(): Promise<CommunityMessengerCallSession[]> {
  const out = await callV4FetchIncomingSessionsOutcome();
  return out.kind === "ok" ? out.sessions : [];
}

export function isCallV4AcceptPatchJoinableStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? "").trim();
  return normalized === "ringing" || normalized === "active";
}

export async function callV4PatchAccept(
  callId: string
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const sid = callId.trim();
  logCallV4("accept_patch_start", { callId: sid });
  logCallV4("call_v4_accept_patch_attempt", { callId: sid });
  logCallV4("accept_patch_http_start", { callId: sid });

  const patchUrl = `/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}`;
  const patchInit: RequestInit = {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "accept" }),
  };
  logCallV4("fetch_request_created", { callId: sid, method: patchInit.method ?? "PATCH" });
  logCallV4("fetch_request_sent", { callId: sid });
  const res = await fetch(patchUrl, patchInit);
  logCallV4("fetch_response_received", { callId: sid, httpStatus: res.status, ok: res.ok });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: CommunityMessengerCallSession;
    error?: string;
  };
  logCallV4("fetch_body_read", {
    callId: sid,
    httpStatus: res.status,
    payloadOk: Boolean(json.ok),
  });
  const result = { ...json, ok: Boolean(res.ok && json.ok) };
  const sessionStatus = result.session?.status ?? null;
  const callKind = result.session?.callKind ?? null;
  const httpStatus = res.status;

  if (!result.ok) {
    const reason = result.error ?? "patch_accept_http_failed";
    logCallV4("accept_patch_http_fail", {
      callId: sid,
      httpStatus,
      bodyStatus: sessionStatus,
      error: reason,
      callKind,
    });
    if (reason === "session_terminal" || reason === "bad_action") {
      logCallV4("accept_patch_terminal", { callId: sid, sessionStatus, callKind, reason });
    }
    logCallV4("call_v4_accept_patch_blocked", {
      callId: sid,
      reason,
      sessionStatus,
      callKind,
    });
    return { ok: false, session: result.session, error: reason };
  }

  logCallV4("accept_patch_http_done", {
    callId: sid,
    httpStatus,
    bodyStatus: sessionStatus,
    callKind,
  });

  if (!isCallV4AcceptPatchJoinableStatus(sessionStatus)) {
    logCallV4("accept_patch_terminal", {
      callId: sid,
      sessionStatus,
      callKind,
      reason: "session_not_joinable_after_patch",
    });
    logCallV4("call_v4_accept_patch_blocked", {
      callId: sid,
      reason: "accept_patch_terminal",
      sessionStatus,
      callKind,
    });
    return { ok: false, session: result.session, error: "accept_patch_terminal" };
  }

  logCallV4("accept_patch_done", { callId: sid, status: sessionStatus, callKind });
  logCallV4("call_v4_accept_patch_done", { callId: sid, status: sessionStatus, callKind });
  return result;
}

export async function callV4PatchReject(
  callId: string
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  logCallV4("reject_patch_start", { callId });
  const result = await patchCommunityMessengerCallSession(callId, "reject");
  if (result.ok) {
    logCallV4("reject_patch_done", { callId, status: result.session?.status ?? null });
  } else {
    logCallV4("reject_patch_failed", { callId, error: result.error ?? null });
  }
  return result;
}

export async function callV4PatchEnd(
  callId: string,
  init?: { durationSeconds?: number; clientEndedReason?: string }
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  logCallV4("end_patch_start", { callId });
  const result = await patchCommunityMessengerCallSession(callId, "end", init);
  if (result.ok) {
    logCallV4("end_patch_done", { callId });
  }
  return result;
}

export async function callV4PatchConnected(
  callId: string
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const sid = callId.trim();
  if (!sid) return { ok: false, error: "session_required" };
  logCallV4("connected_patch_start", { callId: sid });
  const result = await patchCommunityMessengerCallSession(sid, "connected");
  if (result.ok) {
    logCallV4("connected_patch_done", {
      callId: sid,
      connectedAt: result.session?.connectedAt ?? null,
      status: result.session?.status ?? null,
    });
  } else {
    logCallV4("connected_patch_failed", { callId: sid, error: result.error ?? null });
  }
  return result;
}

export async function callV4PatchMissed(
  callId: string
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  logCallV4("missed_patch_start", { callId });
  const result = await patchCommunityMessengerCallSession(callId, "missed");
  if (result.ok) {
    logCallV4("missed_patch_done", {
      callId,
      status: result.session?.status ?? "missed",
    });
  }
  return result;
}

export async function callV4FetchAgoraToken(
  callId: string
): Promise<CommunityMessengerManagedCallConnection | null> {
  const sid = callId.trim();
  if (!sid) return null;
  const identity = readCallV4Identity();
  const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}/token`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    connection?: CommunityMessengerManagedCallConnection;
    error?: string;
    reason?: string;
    sessionStatus?: string;
    callKind?: CommunityMessengerCallKind;
    role?: string;
  };
  if (!res.ok || !json.ok || !json.connection) {
    const role =
      json.role ??
      (identity?.direction === "incoming"
        ? "callee"
        : identity?.direction === "outgoing"
          ? "caller"
          : null);
    const callKind =
      json.callKind ??
      (identity?.mediaType === "video" ? "video" : identity?.mediaType === "audio" ? "voice" : null);
    logCallV4("token_fetch_fail", {
      callId: sid,
      httpStatus: res.status,
      reason: json.reason ?? json.error ?? "token_http_or_payload_failed",
      sessionStatus: json.sessionStatus ?? null,
      callKind,
      role,
    });
    return null;
  }
  if (!json.connection.appId?.trim()) {
    logCallV4("agora_app_id_missing", { callId: sid, source: "token_api" });
    return null;
  }
  if (!json.connection.token?.trim()) {
    logCallV4("agora_token_missing", { callId: sid, source: "token_api" });
    return null;
  }
  return json.connection;
}
