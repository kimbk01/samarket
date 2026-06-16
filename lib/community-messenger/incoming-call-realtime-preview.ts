/**
 * Supabase Realtime `postgres_changes` 의 `new`/`old` 행 → 수신 통화 목록용 세션.
 * GET `/api/.../incoming` 전에 UI를 띄워 벨·배너 지연을 줄인다. 라벨은 이후 refresh 로 보강.
 */
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallParticipant,
  CommunityMessengerCallSession,
  CommunityMessengerCallSessionMode,
  CommunityMessengerCallSessionStatus,
} from "@/lib/community-messenger/types";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function peerFallbackLabel(userId: string): string {
  const compact = userId.replace(/-/g, "");
  return `회원 ${compact.slice(0, 6)}`;
}

function messengerUserIdsEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * `community_messenger_call_sessions` 행 — direct · 수신자가 나 · ringing 일 때만 미리보기 세션 생성.
 */
export function communityMessengerIncomingSessionFromRealtimeRow(
  userId: string,
  raw: Record<string, unknown>
): CommunityMessengerCallSession | null {
  const id = trimText(raw.id);
  const roomId = trimText(raw.room_id);
  const initiatorUserId = trimText(raw.initiator_user_id);
  const recipientUserId = trimText(raw.recipient_user_id);
  const sessionMode = (trimText(raw.session_mode) || "direct") as CommunityMessengerCallSessionMode;
  const status = trimText(raw.status) as CommunityMessengerCallSessionStatus;
  const callKind = trimText(raw.call_kind) as CommunityMessengerCallKind;

  if (!id || !roomId || !initiatorUserId) return null;
  if (sessionMode !== "direct") return null;
  if (!recipientUserId || !messengerUserIdsEqual(recipientUserId, userId)) return null;
  if (status !== "ringing") return null;
  if (callKind !== "voice" && callKind !== "video") return null;

  const startedAt = trimText(raw.started_at) || new Date().toISOString();
  const answeredAt = trimText(raw.answered_at) || null;
  const endedAt = trimText(raw.ended_at) || null;

  const peerUserId = messengerUserIdsEqual(initiatorUserId, userId) ? recipientUserId : initiatorUserId;
  const participants: CommunityMessengerCallParticipant[] = [initiatorUserId, recipientUserId]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((uid) => ({
      userId: uid,
      label: peerFallbackLabel(uid),
      status: uid === initiatorUserId ? "invited" : "invited",
      joinedAt: null,
      leftAt: null,
      isMe: messengerUserIdsEqual(uid, userId),
    }));

  const peerLabel =
    participants.find((p) => p.userId === peerUserId)?.label ?? peerFallbackLabel(peerUserId ?? initiatorUserId);

  return {
    id,
    roomId,
    sessionMode: "direct",
    initiatorUserId,
    recipientUserId,
    peerUserId,
    peerLabel,
    callKind,
    status,
    startedAt,
    answeredAt,
    endedAt,
    isMineInitiator: messengerUserIdsEqual(initiatorUserId, userId),
    participants,
  };
}

/**
 * Broadcast `cm_invite_ring` 만으로 수신 벨 UI 를 열기 위한 최소 세션(GET·부트스트랩 전).
 * `initiatorUserId` 가 페이로드에 없으면 null (구 클라이언트 호환).
 */
export function communityMessengerIncomingSessionFromInviteBroadcast(
  viewerUserId: string,
  payload: Record<string, unknown>
): CommunityMessengerCallSession | null {
  const selfId = trimText(viewerUserId);
  if (!selfId) return null;
  const id = trimText(payload.sessionId);
  const tmpAlias = trimText(payload.tmpSessionId);
  const roomId = trimText(payload.roomId);
  const initiatorUserId = trimText(payload.initiatorUserId);
  const callKind = trimText(payload.callKind) as CommunityMessengerCallKind;
  const startedAt = trimText(payload.startedAt) || new Date().toISOString();
  if (!id || !roomId || !initiatorUserId) return null;
  if (callKind !== "voice" && callKind !== "video") return null;

  const recipientUserId = selfId;
  const status = "ringing" as const;
  const answeredAt = null;
  const endedAt = null;
  const peerUserId = initiatorUserId;
  const participants: CommunityMessengerCallParticipant[] = [initiatorUserId, recipientUserId]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((uid) => ({
      userId: uid,
      label: peerFallbackLabel(uid),
      status: "invited" as const,
      joinedAt: null,
      leftAt: null,
      isMe: messengerUserIdsEqual(uid, selfId),
    }));
  const peerLabel =
    participants.find((p) => p.userId === peerUserId)?.label ?? peerFallbackLabel(peerUserId);

  return {
    id,
    roomId,
    sessionMode: "direct",
    initiatorUserId,
    recipientUserId,
    peerUserId,
    peerLabel,
    callKind,
    status,
    startedAt,
    answeredAt,
    endedAt,
    isMineInitiator: false,
    participants,
    source: "invite_preview",
    isPreview: true,
    ...(tmpAlias ? { tmpSessionId: tmpAlias } : {}),
  };
}

/** FCM foreground wake — GET 전 배너 즉시 표시용 최소 ringing 세션 */
export function communityMessengerIncomingSessionFromFcmWake(
  viewerUserId: string,
  detail: {
    sessionId?: string;
    roomId?: string;
    callKind?: "voice" | "video";
    callerId?: string;
    callerName?: string;
  }
): CommunityMessengerCallSession | null {
  const selfId = trimText(viewerUserId);
  const id = trimText(detail.sessionId);
  const roomId = trimText(detail.roomId);
  const initiatorUserId = trimText(detail.callerId);
  const callKind = detail.callKind;
  if (!selfId || !id || !roomId || !initiatorUserId) return null;
  if (callKind !== "voice" && callKind !== "video") return null;

  const startedAt = new Date().toISOString();
  const peerLabel = trimText(detail.callerName) || peerFallbackLabel(initiatorUserId);
  const recipientUserId = selfId;

  return {
    id,
    roomId,
    sessionMode: "direct",
    initiatorUserId,
    recipientUserId,
    peerUserId: initiatorUserId,
    peerLabel,
    callKind,
    status: "ringing",
    startedAt,
    answeredAt: null,
    endedAt: null,
    isMineInitiator: false,
    participants: [
      {
        userId: initiatorUserId,
        label: peerLabel,
        status: "invited",
        joinedAt: null,
        leftAt: null,
        isMe: false,
      },
      {
        userId: recipientUserId,
        label: peerFallbackLabel(recipientUserId),
        status: "invited",
        joinedAt: null,
        leftAt: null,
        isMe: true,
      },
    ],
    source: "fcm_wake",
    isPreview: true,
  };
}

/**
 * Realtime 이벤트 한 건을 수신 목록 상태에 반영한다.
 */
export function applyIncomingCallSessionsRealtimeEvent(
  prev: CommunityMessengerCallSession[],
  userId: string,
  payload: { eventType?: string; new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }
): CommunityMessengerCallSession[] {
  const eventType = payload.eventType ?? "";
  const oldRow = payload.old ?? null;
  const newRow = payload.new ?? null;

  if (eventType === "DELETE" && oldRow && typeof oldRow.id === "string") {
    return prev.filter((s) => s.id !== oldRow.id);
  }

  if (eventType === "INSERT" && newRow) {
    const next = communityMessengerIncomingSessionFromRealtimeRow(userId, newRow);
    if (!next) return prev;
    const rest = prev.filter((s) => s.id !== next.id);
    return [next, ...rest];
  }

  if (eventType === "UPDATE" && newRow) {
    const id = trimText(newRow.id);
    if (!id) return prev;
    const next = communityMessengerIncomingSessionFromRealtimeRow(userId, newRow);
    if (!next) {
      return prev.filter((s) => s.id !== id);
    }
    const rest = prev.filter((s) => s.id !== id);
    return [next, ...rest];
  }

  return prev;
}
