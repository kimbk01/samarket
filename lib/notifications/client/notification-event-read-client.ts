import { logNotifyOpen } from "@/lib/notifications/core/notification-logs";
import type { MessengerHubBadgeResyncReason } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import {
  applyMissedCallNotificationReadOptimistic,
  resyncBadgesAfterNotificationEventsRead,
} from "@/lib/notifications/client/notification-events-read-resync";

type ReadMutationResult = { ok: boolean; cleared?: number };

let callLogsMissedReadFlight: Promise<boolean> | null = null;

async function postJson(url: string, body: Record<string, unknown>): Promise<ReadMutationResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false };
    const j = (await res.json()) as { ok?: boolean; cleared?: number };
    const cleared = Math.max(0, Math.floor(Number(j.cleared) || 0));
    return { ok: j?.ok === true, cleared: cleared > 0 ? cleared : undefined };
  } catch {
    return { ok: false };
  }
}

function afterNotificationEventsRead(reason: MessengerHubBadgeResyncReason, cleared?: number): void {
  if (cleared != null && cleared > 0) {
    applyMissedCallNotificationReadOptimistic(cleared);
  }
  resyncBadgesAfterNotificationEventsRead(reason);
}

export async function postNotificationEventOpenedRead(notificationEventId: string): Promise<boolean> {
  const id = notificationEventId.trim();
  if (!id) return false;
  logNotifyOpen("tap_received", { notificationEventId: id });
  const result = await postJson("/api/me/notifications/read", {
    notificationEventId: id,
    opened: true,
  });
  if (result.ok) {
    logNotifyOpen("deeplink_consumed", { notificationEventId: id });
    afterNotificationEventsRead("notification_opened");
  }
  return result.ok;
}

export async function postNotificationRoomRead(roomId: string): Promise<boolean> {
  const rid = roomId.trim();
  if (!rid) return false;
  const result = await postJson("/api/me/notifications/room-read", { roomId: rid });
  if (result.ok) {
    logNotifyOpen("room_opened", { roomId: rid });
    afterNotificationEventsRead("room_read", result.cleared);
  }
  return result.ok;
}

export async function postNotificationMissedCallRead(opts: {
  roomId?: string;
  callSessionId?: string;
}): Promise<boolean> {
  const roomId = opts.roomId?.trim() || undefined;
  const callSessionId = opts.callSessionId?.trim() || undefined;
  if (!roomId && !callSessionId) return false;
  const result = await postJson("/api/me/notifications/missed-call-read", {
    roomId,
    callSessionId,
  });
  if (result.ok) {
    afterNotificationEventsRead("missed_call_read", result.cleared);
  }
  return result.ok;
}

/** 통화목록 — 미읽음 부재중 notification_events 전체 읽음 (single-flight) */
export async function postNotificationCallLogsMissedCallsRead(): Promise<boolean> {
  if (callLogsMissedReadFlight) return callLogsMissedReadFlight;
  callLogsMissedReadFlight = (async () => {
    const result = await postJson("/api/me/notifications/missed-call-read", { scope: "call_logs" });
    if (result.ok) {
      afterNotificationEventsRead("call_logs_viewed", result.cleared);
    }
    return result.ok;
  })().finally(() => {
    callLogsMissedReadFlight = null;
  });
  return callLogsMissedReadFlight;
}
