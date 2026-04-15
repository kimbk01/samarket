/**
 * 웹 클라이언트 — 통화 세션 HTTP 액션 (HTTPS 운영 기준, credentials 포함).
 * 네이티브는 동일 엔드포인트·페이로드를 재사용.
 */

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type PatchCommunityCallSessionAction =
  | "accept"
  | "reject"
  | "cancel"
  | "end"
  | "missed"
  | "upgrade_to_video"
  | "downgrade_to_voice";

export async function patchCommunityMessengerCallSession(
  sessionId: string,
  action: PatchCommunityCallSessionAction,
  init?: { durationSeconds?: number }
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action,
      ...(init?.durationSeconds != null ? { durationSeconds: init.durationSeconds } : {}),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: CommunityMessengerCallSession;
    error?: string;
  };
  return { ...json, ok: Boolean(res.ok && json.ok) };
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
    body: JSON.stringify({ callKind: input.callKind }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: CommunityMessengerCallSession;
    error?: string;
  };
  return { ...json, ok: Boolean(res.ok && json.ok) };
}
