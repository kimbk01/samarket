/**
 * 커뮤니티 메신저 1:1 수신 통화 — 탭이 닫혀 있어도 Web Push 로 알림.
 * `public/sw.js` 가 `sessionId`·`url` 로 통화 화면으로 연결한다.
 */

import { getSiteOrigin } from "@/lib/env/runtime";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { sendWebPushNotificationsForUser } from "@/lib/push/send-web-push-for-user";

function absolutizeLink(link: string | null | undefined): string | null {
  if (link == null || !String(link).trim()) return null;
  const s = String(link).trim();
  if (/^https?:\/\//i.test(s)) return s;
  const base = getSiteOrigin();
  if (!base) return null;
  return s.startsWith("/") ? `${base}${s}` : `${base}/${s}`;
}

export async function sendWebPushForCommunityMessengerIncomingCall(input: {
  recipientUserId: string;
  sessionId: string;
  callKind: CommunityMessengerCallKind;
  callerDisplayName: string;
}): Promise<void> {
  const recipient = input.recipientUserId.trim();
  const sessionId = input.sessionId.trim();
  if (!recipient || !sessionId) return;

  const link_url = `/community-messenger/calls/${encodeURIComponent(sessionId)}`;
  const isVideo = input.callKind === "video";
  const out: NotificationSideEffectPayloadOut = {
    user_id: recipient,
    notification_type: "community_messenger_incoming_call",
    title: isVideo ? "영상 통화" : "음성 통화",
    body: `${input.callerDisplayName}님의 전화`,
    link_url,
    meta: { session_id: sessionId, kind: input.callKind },
    link_url_absolute: absolutizeLink(link_url),
    occurred_at: new Date().toISOString(),
  };

  await sendWebPushNotificationsForUser(out);
}
