import { logNotifyOpen } from "@/lib/notifications/core/notification-logs";
import { requestNotificationBadgeCountResync } from "@/lib/notifications/notification-badge-count-store";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";

async function postJson(url: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { ok?: boolean };
    return j?.ok === true;
  } catch {
    return false;
  }
}

export async function postNotificationEventOpenedRead(notificationEventId: string): Promise<boolean> {
  const id = notificationEventId.trim();
  if (!id) return false;
  logNotifyOpen("tap_received", { notificationEventId: id });
  const ok = await postJson("/api/me/notifications/read", {
    notificationEventId: id,
    opened: true,
  });
  if (ok) {
    logNotifyOpen("deeplink_consumed", { notificationEventId: id });
    requestNotificationBadgeCountResync("notification_opened");
  }
  return ok;
}

export async function postNotificationRoomRead(roomId: string): Promise<boolean> {
  const rid = roomId.trim();
  if (!rid) return false;
  const ok = await postJson("/api/me/notifications/room-read", { roomId: rid });
  if (ok) {
    logNotifyOpen("room_opened", { roomId: rid });
    requestNotificationBadgeCountResync("room_read");
  }
  return ok;
}

export async function postNotificationMissedCallRead(opts: {
  roomId?: string;
  callSessionId?: string;
}): Promise<boolean> {
  const roomId = opts.roomId?.trim() || undefined;
  const callSessionId = opts.callSessionId?.trim() || undefined;
  if (!roomId && !callSessionId) return false;
  const ok = await postJson("/api/me/notifications/missed-call-read", {
    roomId,
    callSessionId,
  });
  if (ok) requestNotificationBadgeCountResync("missed_call_read");
  return ok;
}

function resyncMessengerBadgeAfterMissedCallRead(reason: string): void {
  requestNotificationBadgeCountResync(reason);
  requestMessengerHubBadgeResync("call_logs_viewed");
}

/** 통화목록 탭·독립 통화 기록 화면 — 미읽음 부재중 알림 전체 읽음 */
export async function postNotificationCallLogsMissedCallsRead(): Promise<boolean> {
  const ok = await postJson("/api/me/notifications/missed-call-read", { scope: "call_logs" });
  if (ok) resyncMessengerBadgeAfterMissedCallRead("call_logs_missed_read");
  return ok;
}
