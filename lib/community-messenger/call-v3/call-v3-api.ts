/**
 * V3 HTTP facade — wraps existing call session APIs only.
 * DO NOT import call-engine from this module.
 */

import {
  fetchCommunityMessengerCallSessionByIdClient,
  patchCommunityMessengerCallSession,
  startCommunityMessengerRoomCall,
  type PatchCommunityCallSessionAction,
} from "@/lib/community-messenger/call-http-actions";
import type { CommunityMessengerCallKind, CommunityMessengerCallSession, CommunityMessengerManagedCallConnection } from "@/lib/community-messenger/types";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";

export type CallV3PatchAction = Extract<
  PatchCommunityCallSessionAction,
  "accept" | "reject" | "cancel" | "end" | "missed"
>;

export type CallV3MediaType = "audio" | "video";

export function callV3MediaTypeFromKind(kind: CommunityMessengerCallKind): CallV3MediaType {
  return kind === "video" ? "video" : "audio";
}

/** Server reconcile via existing active-call route (create_guard equivalent on client). */
export async function callV3ReconcileBeforeCreate(): Promise<void> {
  await fetch("/api/community-messenger/calls/sessions/active", {
    credentials: "include",
    cache: "no-store",
  }).catch(() => undefined);
}

/** Incoming discovery — same reconcile entry as create. */
export async function callV3ReconcileBeforeIncoming(): Promise<void> {
  await callV3ReconcileBeforeCreate();
}

export async function callV3FetchIncomingSessions(): Promise<CommunityMessengerCallSession[]> {
  const res = await fetch("/api/community-messenger/calls/sessions/incoming?directOnly=1", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    sessions?: CommunityMessengerCallSession[];
  };
  if (!json.ok) return [];
  return json.sessions ?? [];
}

export async function callV3ResolveOutgoingRoomId(input: {
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

export async function callV3FetchSession(
  callId: string
): Promise<CommunityMessengerCallSession | null> {
  return fetchCommunityMessengerCallSessionByIdClient(callId);
}

export type CallV3CallerPollFetchResult = {
  session: CommunityMessengerCallSession | null;
  httpStatus: number;
  notFound: boolean;
};

/** Caller poll — cache-bust + server reconcile so WebView cannot serve stale ringing. */
export async function callV3FetchSessionForCallerPoll(
  callId: string
): Promise<CallV3CallerPollFetchResult> {
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

export async function callV3CreateSession(input: {
  roomId: string;
  mediaType: CallV3MediaType;
}): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const callKind = input.mediaType === "video" ? "video" : "voice";
  logCallV3("create_start", { roomId: input.roomId, mediaType: input.mediaType });
  const result = await startCommunityMessengerRoomCall({ roomId: input.roomId, callKind });
  if (result.ok && result.session?.id) {
    logCallV3("create_done", { callId: result.session.id, roomId: input.roomId });
  }
  return result;
}

export async function callV3Patch(
  callId: string,
  action: CallV3PatchAction,
  init?: { durationSeconds?: number; clientEndedReason?: string }
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const result = await patchCommunityMessengerCallSession(callId, action, init);
  return result;
}

export async function callV3PatchCancel(
  callId: string
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  logCallV3("cancel_patch_start", { callId });
  const result = await patchCommunityMessengerCallSession(callId, "cancel");
  if (result.ok) {
    logCallV3("cancel_patch_done", { callId });
  }
  return result;
}

export async function callV3PatchAccept(
  callId: string
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  logCallV3("accept_patch_start", { callId });
  const result = await patchCommunityMessengerCallSession(callId, "accept");
  if (result.ok) {
    logCallV3("accept_patch_done", { callId });
  }
  return result;
}

export async function callV3PatchReject(
  callId: string
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  logCallV3("reject_patch_start", { callId });
  const result = await patchCommunityMessengerCallSession(callId, "reject");
  if (result.ok) {
    const session = result.session;
    logCallV3("reject_patch_done", {
      callId,
      status: session?.status ?? null,
    });
    logCallV3("reject_patch_response", {
      callId: session?.id ?? callId,
      status: session?.status ?? null,
      updated_at: session?.endedAt ?? session?.startedAt ?? null,
    });
  } else {
    logCallV3("reject_patch_failed", { callId, error: result.error ?? null });
  }
  return result;
}

/** PATCH 실패 후 DB rejected 전이 — 발신 측 polling/bus 해제용 best-effort 재시도 */
export function scheduleCallV3RejectPatchRetry(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  void patchCommunityMessengerCallSession(sid, "reject").then((result) => {
    if (result.ok) {
      logCallV3("reject_patch_retry_ok", { callId: sid, status: result.session?.status ?? null });
      return;
    }
    logCallV3("reject_patch_retry_failed", { callId: sid, error: result.error ?? null });
  });
}

type CallV3TokenResponse = {
  ok?: boolean;
  connection?: CommunityMessengerManagedCallConnection;
  error?: string;
};

/** Reuses existing managed-call token API (same route as CallClient). */
export async function callV3FetchAgoraToken(
  callId: string
): Promise<CommunityMessengerManagedCallConnection | null> {
  const sid = callId.trim();
  if (!sid) return null;

  const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}/token`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as CallV3TokenResponse;
  if (!res.ok || !json.ok || !json.connection) {
    return null;
  }
  return json.connection;
}

export async function callV3PatchEnd(
  callId: string,
  init?: { durationSeconds?: number; clientEndedReason?: string }
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  logCallV3("end_patch_start", { callId });
  const result = await patchCommunityMessengerCallSession(callId, "end", init);
  if (result.ok) {
    logCallV3("end_patch_done", { callId });
  }
  return result;
}
