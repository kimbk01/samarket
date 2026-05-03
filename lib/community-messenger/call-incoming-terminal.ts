/**
 * 수신 통화 목록·프리뷰 세션의 터미널 매칭·제거 (발신 취소/종료 시 로컬 상태 정합).
 */
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallSession,
} from "@/lib/community-messenger/types";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";

/** UI 에서 링/오버레이를 닫아야 하는 종료 계열 (DB `community_messenger_call_sessions.status` + 확장) */
export function isTerminalIncomingCallStatus(status: unknown): boolean {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  return (
    s === "ended" ||
    s === "cancelled" ||
    s === "rejected" ||
    s === "missed" ||
    s === "failed" ||
    s === "timeout"
  );
}

export type CallIncomingTerminalQuery = {
  sessionId?: string | null;
  tmpSessionId?: string | null;
  roomId?: string | null;
  initiatorUserId?: string | null;
  callKind?: CommunityMessengerCallKind | null;
  status?: string | null;
  reason?: string | null;
};

function trimU(s: string | null | undefined): string {
  return typeof s === "string" ? s.trim() : "";
}

export type CallTerminalEventInput = {
  sessionId?: string | null;
  tmpSessionId?: string | null;
  roomId?: string | null;
  initiatorUserId?: string | null;
  callKind?: CommunityMessengerCallKind | null;
  reason?: string | null;
};

/** 공통 터미널 이벤트 → 쿼리 (수신 목록 제거·오버레이 닫기용) */
export function callIncomingTerminalQueryFromEvent(input: CallTerminalEventInput): CallIncomingTerminalQuery {
  return {
    sessionId: input.sessionId ?? null,
    tmpSessionId: input.tmpSessionId ?? null,
    roomId: input.roomId ?? null,
    initiatorUserId: input.initiatorUserId ?? null,
    callKind: input.callKind ?? null,
    status: null,
    reason: input.reason ?? null,
  };
}

/**
 * 터미널 이벤트 키로 수신 세션 한 건이 대상인지.
 * 순서: (1) sessionId ↔ id / tmpSessionId 교차 (2) tmpSessionId ↔ id / tmpSessionId (3) room+initiator+callKind
 */
export function matchIncomingCallSessionToTerminalQuery(
  s: CommunityMessengerCallSession,
  q: CallIncomingTerminalQuery
): {
  match: boolean;
  matchedBy: "sessionId" | "tmpSessionId" | "room_initiator_kind" | "session_cross_tmp" | "";
} {
  const qSid = trimU(q.sessionId);
  const qTmp = trimU(q.tmpSessionId);
  const sTmp = trimU(s.tmpSessionId ?? null);

  if (qSid) {
    if (s.id === qSid) {
      return { match: true, matchedBy: "sessionId" };
    }
    /** 터미널 payload 의 sessionId 가 dial tmp 인 경우 — 실제 id 는 별도 */
    if (sTmp && sTmp === qSid) {
      return { match: true, matchedBy: "session_cross_tmp" };
    }
  }
  if (qTmp) {
    if (s.id === qTmp || (sTmp && sTmp === qTmp)) {
      return { match: true, matchedBy: "tmpSessionId" };
    }
  }
  const r = trimU(q.roomId);
  const i = trimU(q.initiatorUserId);
  const k = q.callKind;
  if (r && i && (k === "voice" || k === "video")) {
    if (
      trimU(s.roomId) === r &&
      trimU(s.initiatorUserId) === i &&
      s.callKind === k
    ) {
      return { match: true, matchedBy: "room_initiator_kind" };
    }
  }
  return { match: false, matchedBy: "" };
}

export function filterRemoveIncomingSessionsMatchingTerminal(
  prev: CommunityMessengerCallSession[],
  q: CallIncomingTerminalQuery
): { next: CommunityMessengerCallSession[]; removed: CommunityMessengerCallSession[]; matchedBy: string } {
  const removed: CommunityMessengerCallSession[] = [];
  let matchedBy = "";
  const next = prev.filter((s) => {
    const { match, matchedBy: by } = matchIncomingCallSessionToTerminalQuery(s, q);
    if (match) {
      removed.push(s);
      if (!matchedBy && by) matchedBy = by;
      return false;
    }
    return true;
  });
  return { next, removed, matchedBy };
}

export function isRingingIncomingOverlayCandidate(
  s: CommunityMessengerCallSession,
  viewerUserId: string
): boolean {
  const uid = viewerUserId.trim();
  if (!uid) return false;
  if (s.status !== "ringing" || s.sessionMode !== "direct" || s.isMineInitiator) return false;
  if (!s.recipientUserId || !messengerUserIdsEqual(s.recipientUserId, uid)) return false;
  if (s.endedAt) return false;
  if (s.cancelledAt) return false;
  if (isTerminalIncomingCallStatus(s.status)) return false;
  return true;
}

export function isDirectRingingCalleeForSound(
  s: CommunityMessengerCallSession,
  viewerUserId: string
): boolean {
  const uid = viewerUserId.trim();
  if (!uid) return false;
  if (s.status !== "ringing" || s.isMineInitiator) return false;
  if (!s.recipientUserId || !messengerUserIdsEqual(s.recipientUserId, uid)) return false;
  if (s.endedAt) return false;
  if (s.cancelledAt) return false;
  if (isTerminalIncomingCallStatus(s.status)) return false;
  return true;
}
