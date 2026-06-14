/**
 * 1:1 통화 발신 취소 — 수신자 기존 통화 알림/CallKit 정리용 push (새 알림 없음).
 * @see docs/messenger-call-notification-policy.md
 */

import { getSiteOrigin } from "@/lib/env/runtime";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";

function absolutizeLink(link: string | null | undefined): string | null {
  if (link == null || !String(link).trim()) return null;
  const s = String(link).trim();
  if (/^https?:\/\//i.test(s)) return s;
  const base = getSiteOrigin();
  if (!base) return null;
  return s.startsWith("/") ? `${base}${s}` : `${base}/${s}`;
}

export async function sendWebPushForCommunityMessengerCallCanceled(input: {
  recipientUserId: string;
  sessionId: string;
}): Promise<void> {
  const recipient = input.recipientUserId.trim();
  const sessionId = input.sessionId.trim();
  if (!recipient || !sessionId) return;

  const link_url = `/community-messenger/calls/${encodeURIComponent(sessionId)}`;
  const out: NotificationSideEffectPayloadOut = {
    user_id: recipient,
    notification_type: "community_messenger_call_canceled",
    title: "통화",
    body: "",
    link_url,
    meta: { session_id: sessionId },
    link_url_absolute: absolutizeLink(link_url),
    occurred_at: new Date().toISOString(),
  };

  await dispatchPushForUser(out, {
    event_type: "call_cancel",
    target_type: "call_session",
    target_id: sessionId,
    call_push_kind: "call_canceled",
    skip_settings_gate: true,
  });
}
