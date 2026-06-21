/**
 * Supabase Realtime / Broadcast / FCM — 수신 ringing **힌트**만 (카톡/텔레그램).
 * 표시(닉·아바타)는 `initiatorUserId` → `useIncomingCallerDisplay` / GET 스냅샷 SSOT.
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

function messengerUserIdsEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function buildDirectIncomingHintSession(input: {
  id: string;
  roomId: string;
  initiatorUserId: string;
  recipientUserId: string;
  callKind: CommunityMessengerCallKind;
  startedAt: string;
  source: string;
  isPreview?: boolean;
  tmpSessionId?: string;
}): CommunityMessengerCallSession {
  const participants: CommunityMessengerCallParticipant[] = [
    {
      userId: input.initiatorUserId,
      label: "",
      status: "invited",
      joinedAt: null,
      leftAt: null,
      isMe: false,
    },
    {
      userId: input.recipientUserId,
      label: "",
      status: "invited",
      joinedAt: null,
      leftAt: null,
      isMe: true,
    },
  ];

  return {
    id: input.id,
    roomId: input.roomId,
    sessionMode: "direct",
    initiatorUserId: input.initiatorUserId,
    recipientUserId: input.recipientUserId,
    peerUserId: input.initiatorUserId,
    peerLabel: "",
    callKind: input.callKind,
    status: "ringing",
    startedAt: input.startedAt,
    answeredAt: null,
    endedAt: null,
    isMineInitiator: false,
    participants,
    source: input.source,
    ...(input.isPreview ? { isPreview: true } : {}),
    ...(input.tmpSessionId ? { tmpSessionId: input.tmpSessionId } : {}),
  };
}

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

  return buildDirectIncomingHintSession({
    id,
    roomId,
    initiatorUserId,
    recipientUserId,
    callKind,
    startedAt: trimText(raw.started_at) || new Date().toISOString(),
    source: "realtime_hint",
  });
}

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

  return buildDirectIncomingHintSession({
    id,
    roomId,
    initiatorUserId,
    recipientUserId: selfId,
    callKind,
    startedAt,
    source: "invite_preview",
    isPreview: true,
    tmpSessionId: tmpAlias || undefined,
  });
}

export function communityMessengerIncomingSessionFromFcmWake(
  viewerUserId: string,
  detail: {
    sessionId?: string;
    roomId?: string;
    callKind?: "voice" | "video";
    callerId?: string;
  }
): CommunityMessengerCallSession | null {
  const selfId = trimText(viewerUserId);
  const id = trimText(detail.sessionId);
  const roomId = trimText(detail.roomId);
  const initiatorUserId = trimText(detail.callerId);
  const callKind = detail.callKind;
  if (!selfId || !id || !roomId || !initiatorUserId) return null;
  if (callKind !== "voice" && callKind !== "video") return null;

  return buildDirectIncomingHintSession({
    id,
    roomId,
    initiatorUserId,
    recipientUserId: selfId,
    callKind,
    startedAt: new Date().toISOString(),
    source: "fcm_wake",
    isPreview: true,
  });
}

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
