import { logNotifyOpen } from "@/lib/notifications/core/notification-logs";
import type { MessengerHubBadgeResyncReason } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import {
  applyMissedCallNotificationReadOptimistic,
  resyncBadgesAfterNotificationEventsRead,
} from "@/lib/notifications/client/notification-events-read-resync";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type ReadMutationResult = { ok: boolean; cleared?: number };
type ReadThreadClientOptions = {
  threadType?: "chat_room" | "trade_room" | "order" | "community_post" | "call";
  roomId?: string;
  categories?: string[];
  readReason?:
    | "chat_room_visible"
    | "push_tap_room_opened"
    | "order_detail_opened"
    | "trade_detail_opened"
    | "community_post_opened"
    | "call_history_opened";
  lastVisibleMessageId?: string | null;
  clientVisibleAt?: string;
};

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

export async function postNotificationEventOpenedRead(
  notificationEventId: string,
  opts?: { dismissed?: boolean }
): Promise<boolean> {
  const id = notificationEventId.trim();
  if (!id) return false;
  logNotifyOpen("tap_received", { notificationEventId: id });
  const result = await postJson("/api/me/notifications/read", {
    notificationEventId: id,
    opened: opts?.dismissed !== true,
    dismissed: opts?.dismissed === true,
  });
  if (result.ok) {
    logNotifyOpen(opts?.dismissed ? "dismissed" : "deeplink_consumed", { notificationEventId: id });
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

export async function postNotificationCategoryRead(category: string): Promise<boolean> {
  const cat = category.trim();
  if (!cat) return false;
  const result = await postJson("/api/me/notifications/read-category", { category: cat });
  if (result.ok) {
    afterNotificationEventsRead("notification_opened", result.cleared);
  }
  return result.ok;
}

function threadReadSingleFlightKey(threadId: string, opts?: ReadThreadClientOptions): string {
  const categories = Array.isArray(opts?.categories)
    ? [...opts.categories].map((c) => c.trim()).filter(Boolean).sort().join(",")
    : "";
  return `notification-thread-read:${threadId}:${opts?.threadType ?? "chat_room"}:${categories}`;
}

/** 방·스레드 단위 notification_events 읽음 (동시·연속 중복 호출 single-flight) */
export async function postNotificationThreadRead(
  threadId: string,
  opts?: ReadThreadClientOptions
): Promise<boolean> {
  const tid = threadId.trim();
  if (!tid) return false;
  const flightKey = threadReadSingleFlightKey(tid, opts);
  return runSingleFlight(flightKey, async () => {
    const result = await postJson("/api/me/notifications/read-thread", {
      threadId: tid,
      ...opts,
      roomId: opts?.roomId?.trim() || undefined,
      categories: Array.isArray(opts?.categories)
        ? opts.categories.map((c) => c.trim()).filter(Boolean)
        : undefined,
    });
    if (result.ok) {
      afterNotificationEventsRead("room_read", result.cleared);
    }
    return result.ok;
  });
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
