import {
  patchCommunityMessengerCallSession,
  postCommunityMessengerCallHangupSignal,
  startCommunityMessengerRoomCall,
} from "@/lib/call/call-actions";
import type {
  CommunityMessengerCallSession,
  CommunityMessengerManagedCallConnection,
} from "@/lib/community-messenger/types";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";

export async function callV3CreateSession(input: {
  roomId: string;
  callKind: "voice" | "video";
}): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string; userMessage?: string }> {
  const res = await startCommunityMessengerRoomCall(input);
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

export async function callV3GetSession(
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

export async function callV3FetchIncomingSessions(): Promise<CommunityMessengerCallSession[]> {
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

export async function callV3PatchAccept(sessionId: string) {
  return patchCommunityMessengerCallSession(sessionId, "accept");
}

export async function callV3PatchReject(sessionId: string) {
  return patchCommunityMessengerCallSession(sessionId, "reject");
}

export async function callV3PatchEnd(sessionId: string, durationSeconds?: number) {
  return patchCommunityMessengerCallSession(sessionId, "end", { durationSeconds });
}

export async function callV3PatchCancel(sessionId: string) {
  return patchCommunityMessengerCallSession(sessionId, "cancel");
}

export async function callV3PatchMissed(sessionId: string) {
  return patchCommunityMessengerCallSession(sessionId, "missed");
}

export async function callV3SendRemoteEnd(input: {
  sessionId: string;
  toUserId: string;
  reason?: string;
}): Promise<void> {
  const viewerId = getSyncViewerUserIdForClient()?.trim();
  await postCommunityMessengerCallHangupSignal({
    sessionId: input.sessionId,
    toUserId: input.toUserId,
    reason: input.reason ?? "end",
  });
  void viewerId;
}

export async function callV3FetchAgoraConnection(sessionId: string): Promise<{
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
