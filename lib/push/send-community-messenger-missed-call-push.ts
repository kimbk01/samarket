/**
 * 1:1 통화 — 세션이 `missed`로 확정된 뒤 부재중 안내 Web Push.
 * 정책: `docs/messenger-call-notification-policy.md`
 */

import { getSiteOrigin } from "@/lib/env/runtime";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";

function absolutizeLink(link: string | null | undefined): string | null {
  if (link == null || !String(link).trim()) return null;
  const s = String(link).trim();
  if (/^https?:\/\//i.test(s)) return s;
  const base = getSiteOrigin();
  if (!base) return null;
  return s.startsWith("/") ? `${base}${s}` : `${base}/${s}`;
}

/**
 * 발신·수신 양 당사자에게 각각 부재중 푸시(구독이 있는 브라우저만).
 */
export async function sendWebPushForCommunityMessengerMissedCall(input: {
  initiatorUserId: string;
  recipientUserId: string;
  sessionId: string;
  roomId: string;
  initiatorDisplayName?: string;
  recipientDisplayName?: string;
}): Promise<void> {
  const sessionId = input.sessionId.trim();
  const roomId = input.roomId.trim();
  const initiatorId = input.initiatorUserId.trim();
  const recipientId = input.recipientUserId.trim();
  if (!sessionId || !roomId || !initiatorId || !recipientId) return;
  if (messengerUserIdsEqual(initiatorId, recipientId)) return;

  const occurred_at = new Date().toISOString();
  const link_url = `/community-messenger/calls/logs?callId=${encodeURIComponent(sessionId)}`;

  const build = (
    user_id: string,
    callerId: string,
    callerName: string
  ): NotificationSideEffectPayloadOut => ({
    user_id,
    notification_type: "community_messenger_missed_call",
    title: "부재중 통화",
    body: callerName ? `${callerName}님의 부재중 통화` : "",
    link_url,
    meta: {
      session_id: sessionId,
      room_id: roomId,
      caller_id: callerId,
      caller_name: callerName,
      missed_at: occurred_at,
    },
    link_url_absolute: absolutizeLink(link_url),
    occurred_at,
  });

  await dispatchPushForUser(build(initiatorId, recipientId, input.recipientDisplayName?.trim() || ""), {
    event_type: "missed_call",
    target_type: "call_session",
    target_id: sessionId,
    call_push_kind: "missed_call",
  });
  await dispatchPushForUser(build(recipientId, initiatorId, input.initiatorDisplayName?.trim() || ""), {
    event_type: "missed_call",
    target_type: "call_session",
    target_id: sessionId,
    call_push_kind: "missed_call",
  });
}
