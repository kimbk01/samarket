import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMissedCallDedupeKey } from "@/lib/notifications/core/notification-policy";
import { logMissedCall } from "@/lib/notifications/core/notification-logs";
import { buildMissedCallWebPath } from "@/lib/notifications/policy/notification-deeplink-policy";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";
import { createAndDispatchNotificationEvent } from "@/lib/notifications/pipeline/notification-event-dispatcher";

export type NotifyMissedCallPipelineInput = {
  sessionId: string;
  roomId: string;
  initiatorUserId: string;
  recipientUserId: string;
  initiatorDisplayName?: string;
  recipientDisplayName?: string;
};

async function createMissedEventForUser(
  sb: SupabaseClient<any>,
  args: {
    userId: string;
    peerUserId: string;
    peerDisplayName: string;
    sessionId: string;
    roomId: string;
  }
): Promise<void> {
  const title = "부재중 통화";
  const body = args.peerDisplayName ? `${args.peerDisplayName}님의 부재중 통화` : "";
  const dedupeKey = buildMissedCallDedupeKey(args.sessionId, args.userId);
  const created = await createAndDispatchNotificationEvent(sb, {
    userId: args.userId,
    type: "missed_call",
    category: "missed_call",
    roomId: args.roomId,
    callSessionId: args.sessionId,
    actorUserId: args.peerUserId,
    title,
    body,
    dedupeKey,
    unread: true,
    appState: "background",
  });

  if (!created.ok) {
    if (created.duplicate) return;
    logMissedCall("created", { userId: args.userId, error: created.error });
    return;
  }

  logMissedCall("created", { userId: args.userId, eventId: created.row.id, sessionId: args.sessionId });
  invalidateNotificationBadgeCache(args.userId);
  logMissedCall("notified", {
    userId: args.userId,
    eventId: created.row.id,
    url: buildMissedCallWebPath(args.roomId, args.sessionId),
  });
}

/**
 * 부재중 통화 — **수신자(callee)만** Bell / notification_events.
 * CONTRACT: caller 에게 missed Bell·App icon 을 올리지 않는다 (제품: 부재중은 수신자 unread).
 */
export async function notifyMissedCallPipeline(
  sb: SupabaseClient<any>,
  input: NotifyMissedCallPipelineInput
): Promise<void> {
  const sessionId = input.sessionId.trim();
  const roomId = input.roomId.trim();
  const initiatorId = input.initiatorUserId.trim();
  const recipientId = input.recipientUserId.trim();
  if (!sessionId || !roomId || !initiatorId || !recipientId) return;
  if (initiatorId === recipientId) return;

  await createMissedEventForUser(sb, {
    userId: recipientId,
    peerUserId: initiatorId,
    peerDisplayName: input.initiatorDisplayName?.trim() || "",
    sessionId,
    roomId,
  });
}
