/**
 * V4 HTTP facade — shared call session APIs only (no V3 imports).
 */

import {
  fetchCommunityMessengerCallSessionByIdClient,
  patchCommunityMessengerCallSession,
  startCommunityMessengerRoomCall,
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

export async function callV4ResolveOutgoingRoomId(input: {
  roomId?: string | null;
  peerUserId?: string | null;
  signal?: AbortSignal;
}): Promise<{ ok: true; roomId: string } | { ok: false; error: string }> {
  const existingRoomId = input.roomId?.trim() ?? "";
  if (existingRoomId) {
    return { ok: true, roomId: existingRoomId };
  }

  const peerUserId = input.peerUserId?.trim() ?? "";
  if (!peerUserId) {
    return { ok: false, error: "missing_room" };
  }

  const res = await fetch("/api/community-messenger/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ roomType: "direct", peerUserId }),
    signal: input.signal,
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    roomId?: string;
    error?: string;
  };
  if (!res.ok || !json.ok || !json.roomId) {
    return { ok: false, error: String(json.error ?? "ensure_room_failed") };
  }
  return { ok: true, roomId: String(json.roomId) };
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
    `/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}?ts=${Date.now()}&reconcile=1`,
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
  mediaType: CallV4MediaType;
}): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const callKind = input.mediaType === "video" ? "video" : "voice";
  logCallV4("create_start", { roomId: input.roomId, mediaType: input.mediaType });
  const result = await startCommunityMessengerRoomCall({ roomId: input.roomId, callKind });
  if (result.ok && result.session?.id) {
    logCallV4("create_done", { callId: result.session.id, roomId: input.roomId });
  }
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

export async function callV4FetchIncomingSessions(): Promise<CommunityMessengerCallSession[]> {
  const res = await fetch("/api/community-messenger/calls/sessions/incoming?directOnly=1", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    sessions?: CommunityMessengerCallSession[];
  };
  return json.ok ? (json.sessions ?? []) : [];
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

  const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "accept" }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: CommunityMessengerCallSession;
    error?: string;
  };
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
