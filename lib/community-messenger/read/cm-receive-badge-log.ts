/** 디버그: `[cm-receive-badge]` — `NEXT_PUBLIC_CM_RECEIVE_BADGE_LOG=1` 또는 비프로덕션 */

export type CmReceiveBadgeSource = "realtime" | "home-sync" | "silent_delta" | "manual";

export type CmReceiveBadgeLogPayload = {
  roomId?: string | null;
  messageId?: string | null;
  senderId?: string | null;
  myUserId?: string | null;
  activeRoomId?: string | null;
  routeRoomId?: string | null;
  isSelf?: boolean;
  isActiveRoom?: boolean;
  beforeUnread?: number | null;
  afterUnread?: number | null;
  source?: CmReceiveBadgeSource;
  timestamp?: string;
};

function receiveBadgeLogEnabled(): boolean {
  if (typeof process === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.NEXT_PUBLIC_CM_RECEIVE_BADGE_LOG === "1";
}

export function cmReceiveBadgeLog(event: string, payload: CmReceiveBadgeLogPayload & Record<string, unknown>): void {
  if (!receiveBadgeLogEnabled()) return;
  const timestamp = typeof payload.timestamp === "string" ? payload.timestamp : new Date().toISOString();
  // eslint-disable-next-line no-console
  console.info("[cm-receive-badge]", event, { ...payload, timestamp });
}
