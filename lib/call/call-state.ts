/**
 * 커뮤니티 메신저 통화 — 서버 원장(`community_messenger_call_sessions`)을 기준으로 한
 * 크로스플랫폼(웹 → 네이티브) 공통 라이프사이클 상태.
 *
 * DB 컬럼(현행): id, room_id, initiator_user_id, recipient_user_id, call_kind, status,
 * started_at, answered_at, ended_at, created_at, updated_at (+ 그룹 메시 확장 컬럼).
 * 제안 `ended_reason` / `missed_at`: 마이그레이션 시 이 타입에 맞춰 확장.
 *
 * 제안 `call_events` (감사 로그): id, session_id, actor_user_id, event_type, payload jsonb, created_at.
 * event_type 예: invited | ringing | accepted | declined | canceled | missed | connected | ended
 */

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";

/** 제품·기획서 8상태 — DB status 와 1:1이 아니라 역할(caller/callee)까지 반영한 뷰 */
export type CanonicalCallLifecycle =
  | "idle"
  | "calling"
  | "ringing"
  | "accepted"
  | "declined"
  | "canceled"
  | "missed"
  | "ended";

export type CanonicalCallRole = "caller" | "callee";

export type CanonicalCallSessionView = {
  lifecycle: CanonicalCallLifecycle;
  role: CanonicalCallRole | null;
  callType: "voice" | "video";
  sessionId: string | null;
};

export type CallEventType =
  | "invited"
  | "ringing"
  | "accepted"
  | "declined"
  | "canceled"
  | "missed"
  | "connected"
  | "ended";

/** 터미널 라이프사이클 — UI·스토어 정리·네이티브 CallKit 종료에 사용 */
export function isTerminalCanonicalLifecycle(lifecycle: CanonicalCallLifecycle): boolean {
  return (
    lifecycle === "idle" ||
    lifecycle === "declined" ||
    lifecycle === "canceled" ||
    lifecycle === "missed" ||
    lifecycle === "ended"
  );
}

/**
 * 동시에 다른 라이브 통화가 있을 때 수신 거절 정책(클라 설계 훅).
 * 서버 측 busy 정책과 함께 쓰면 이중 방어.
 */
export function evaluateIncomingCallBusyPolicy(input: {
  incoming: CommunityMessengerCallSession;
  otherLiveSessionId: string | null | undefined;
}): { shouldAutoReject: boolean } {
  const other = input.otherLiveSessionId?.trim();
  if (!other) return { shouldAutoReject: false };
  if (other === input.incoming.id) return { shouldAutoReject: false };
  if (input.incoming.status !== "ringing") return { shouldAutoReject: false };
  return { shouldAutoReject: true };
}

export function deriveCanonicalCallSessionView(session: CommunityMessengerCallSession): CanonicalCallSessionView {
  const callType = session.callKind === "video" ? "video" : "voice";
  const sessionId = session.id;

  const role: CanonicalCallRole | null = session.isMineInitiator ? "caller" : "callee";

  switch (session.status) {
    case "ringing":
      return {
        lifecycle: session.isMineInitiator ? "calling" : "ringing",
        role,
        callType,
        sessionId,
      };
    case "active":
      return { lifecycle: "accepted", role, callType, sessionId };
    case "rejected":
      return { lifecycle: "declined", role, callType, sessionId };
    case "cancelled":
      return { lifecycle: "canceled", role, callType, sessionId };
    case "missed":
      return { lifecycle: "missed", role, callType, sessionId };
    case "ended":
      return { lifecycle: "ended", role, callType, sessionId };
    default:
      return { lifecycle: "idle", role: null, callType, sessionId };
  }
}

export function deriveCanonicalCallSessionViewForViewer(
  session: CommunityMessengerCallSession,
  viewerUserId: string | null | undefined
): CanonicalCallSessionView {
  const base = deriveCanonicalCallSessionView(session);
  const uid = viewerUserId?.trim();
  if (!uid) return base;

  const isCaller = messengerUserIdsEqual(session.initiatorUserId, uid);
  const isCallee =
    session.recipientUserId != null && messengerUserIdsEqual(session.recipientUserId, uid);

  if (session.status === "ringing") {
    if (isCaller) {
      return { ...base, lifecycle: "calling", role: "caller" };
    }
    if (isCallee) {
      return { ...base, lifecycle: "ringing", role: "callee" };
    }
  }

  if (isCaller) return { ...base, role: "caller" };
  if (isCallee) return { ...base, role: "callee" };
  return base;
}
