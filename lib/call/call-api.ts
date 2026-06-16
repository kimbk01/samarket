/**
 * DIBAY 통화 runtime — HTTP API wrapper (세션 create/get/patch/hangup/token).
 */

import type {
  CommunityMessengerCallSession,
  CommunityMessengerManagedCallConnection,
} from "@/lib/community-messenger/types";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";

export type PatchCallSessionAction =
  | "accept"
  | "reject"
  | "cancel"
  | "end"
  | "leave"
  | "missed"
  | "upgrade_to_video"
  | "downgrade_to_voice";

async function patchCallSession(
  sessionId: string,
  action: PatchCallSessionAction,
  init?: { durationSeconds?: number; clientEndedReason?: string }
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
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
  return { ...json, ok: Boolean(res.ok && json.ok) };
}

async function postCallHangupSignal(input: {
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

async function startRoomCall(input: {
  roomId: string;
  callKind: "voice" | "video";
}): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(input.roomId)}/calls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ callKind: input.callKind }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: CommunityMessengerCallSession;
    error?: string;
  };
  return { ...json, ok: Boolean(res.ok && json.ok) };
}

export async function callCreateSession(input: {
  roomId: string;
  callKind: "voice" | "video";
}): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string; userMessage?: string }> {
  const res = await startRoomCall(input);
  if (!res.ok) {
    const err = res.error?.trim();
    if (err === "peer_busy") return { ok: false, userMessage: "상대방이 현재 통화중입니다." };
    if (err === "room_unavailable" || err === "room_archived") {
      return { ok: false, userMessage: "이 대화방에서는 지금 통화를 시작할 수 없습니다." };
    }
    return { ok: false, userMessage: "통화를 시작할 수 없습니다." };
  }
  return res;
}

export async function callGetSession(
  sessionId: string
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession }> {
  const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: CommunityMessengerCallSession;
  };
  return { ok: Boolean(res.ok && json.ok), session: json.session };
}

export async function callFetchIncomingSessions(): Promise<CommunityMessengerCallSession[]> {
  const res = await fetch("/api/community-messenger/calls/sessions/incoming?directOnly=1", {
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    sessions?: CommunityMessengerCallSession[];
  };
  if (!res.ok || !json.ok || !Array.isArray(json.sessions)) return [];
  return json.sessions;
}

export async function callPatchAccept(sessionId: string) {
  return patchCallSession(sessionId, "accept");
}

export async function callPatchReject(sessionId: string) {
  return patchCallSession(sessionId, "reject");
}

export async function callPatchEnd(sessionId: string, durationSeconds?: number) {
  return patchCallSession(sessionId, "end", { durationSeconds });
}

export async function callPatchCancel(sessionId: string) {
  return patchCallSession(sessionId, "cancel");
}

export async function callPatchMissed(sessionId: string) {
  return patchCallSession(sessionId, "missed");
}

export async function callSendRemoteEnd(input: {
  sessionId: string;
  toUserId: string;
  reason?: string;
}): Promise<void> {
  void getSyncViewerUserIdForClient();
  await postCallHangupSignal({
    sessionId: input.sessionId,
    toUserId: input.toUserId,
    reason: input.reason ?? "end",
  });
}

export async function callFetchAgoraConnection(sessionId: string): Promise<{
  ok: boolean;
  connection?: CommunityMessengerManagedCallConnection;
}> {
  const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}/token`, {
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    connection?: CommunityMessengerManagedCallConnection;
  };
  return {
    ok: Boolean(res.ok && json.ok && json.connection),
    connection: json.connection,
  };
}
