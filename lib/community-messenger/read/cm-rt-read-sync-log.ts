/** 디버그: `[cm-rt-read-sync]` — `NEXT_PUBLIC_CM_RT_READ_SYNC_LOG=1` 또는 비프로덕션 */

export type CmRtReadSyncPayload = Record<string, unknown> & {
  roomId?: string | null;
  messageId?: string | null;
  senderId?: string | null;
  viewerUserId?: string | null;
  participantUserId?: string | null;
  lastReadMessageId?: string | null;
  lastReadAt?: string | null;
  unreadCount?: number | null;
  activeRoomId?: string | null;
  routeRoomId?: string | null;
  isSelf?: boolean;
  isPeer?: boolean;
  ignoredReason?: string | null;
  before?: unknown;
  after?: unknown;
  channelScope?: string | null;
  timestamp?: string;
};

function cmRtReadSyncLogEnabled(): boolean {
  if (typeof process === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.NEXT_PUBLIC_CM_RT_READ_SYNC_LOG === "1";
}

export function cmRtReadSyncLog(event: string, payload: CmRtReadSyncPayload): void {
  if (!cmRtReadSyncLogEnabled()) return;
  const timestamp = typeof payload.timestamp === "string" ? payload.timestamp : new Date().toISOString();
  // eslint-disable-next-line no-console
  console.info("[cm-rt-read-sync]", event, { ...payload, timestamp });
}
