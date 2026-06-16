import { buildCallTombstoneContext } from "@/lib/community-messenger/call-events/fcm-call-event-normalizer";
import {
  canShowIncoming,
  type CallTerminalTombstoneContext,
} from "@/lib/community-messenger/call-state/call-terminal-tombstone";
import { communityMessengerIncomingSessionFromFcmWake } from "@/lib/community-messenger/incoming-call-realtime-preview";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type ForegroundIncomingWakeDetail = {
  sessionId?: string;
  roomId?: string;
  callKind?: "voice" | "video";
  callerId?: string;
  callerName?: string;
  callerAvatarUrl?: string;
};

/**
 * FCM foreground wake — tombstone 동기 검사 후 즉시 ringing 행 삽입(벨·배너 레이스 방지).
 * native consumed 는 호출측에서 비동기로 검증한다.
 */
export function buildForegroundIncomingWakeOptimisticSession(
  viewerUserId: string,
  detail: ForegroundIncomingWakeDetail,
  hardClearedAt: Map<string, number>
): CommunityMessengerCallSession | null {
  const sid = detail.sessionId?.trim() ?? "";
  if (!sid) return null;
  const tombstone: CallTerminalTombstoneContext = buildCallTombstoneContext(hardClearedAt);
  if (!canShowIncoming(sid, tombstone)) return null;
  if (!detail.roomId?.trim() || !detail.callerId?.trim() || !detail.callKind) return null;
  return communityMessengerIncomingSessionFromFcmWake(viewerUserId, {
    sessionId: sid,
    roomId: detail.roomId,
    callKind: detail.callKind,
    callerId: detail.callerId,
    callerName: detail.callerName,
    callerAvatarUrl: detail.callerAvatarUrl,
  });
}

export function mergeForegroundIncomingWakeSession(
  prev: CommunityMessengerCallSession[],
  optimistic: CommunityMessengerCallSession
): CommunityMessengerCallSession[] {
  const filtered = prev.filter((s) => s.id !== optimistic.id);
  return [optimistic, ...filtered];
}
