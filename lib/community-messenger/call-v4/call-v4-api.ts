/**
 * V4 HTTP facade — shared call session APIs only (no V3 imports).
 */

import {
  fetchCommunityMessengerCallSessionByIdClient,
  patchCommunityMessengerCallSession,
  startCommunityMessengerRoomCall,
} from "@/lib/community-messenger/call-http-actions";
import type { CommunityMessengerCallKind, CommunityMessengerCallSession, CommunityMessengerManagedCallConnection } from "@/lib/community-messenger/types";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";

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

export async function callV4PatchAccept(
  callId: string
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  logCallV4("accept_patch_start", { callId });
  const result = await patchCommunityMessengerCallSession(callId, "accept");
  if (result.ok) {
    logCallV4("accept_patch_done", { callId });
  }
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
  const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}/token`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    connection?: CommunityMessengerManagedCallConnection;
  };
  if (!res.ok || !json.ok || !json.connection) return null;
  return json.connection;
}
