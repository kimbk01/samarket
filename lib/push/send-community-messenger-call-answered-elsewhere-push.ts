/**
 * Callee multi-device: after first accept, dismiss ringing UI on other devices.
 * @see docs/dibay-call-multi-device-policy.md
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

export async function sendWebPushForCommunityMessengerCallAnsweredElsewhere(input: {
  recipientUserId: string;
  sessionId: string;
  answeredDeviceId: string | null;
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
    meta: {
      session_id: sessionId,
      status: "answered_elsewhere",
      answered_device_id: input.answeredDeviceId,
    },
    link_url_absolute: absolutizeLink(link_url),
    occurred_at: new Date().toISOString(),
  };

  /**
   * 통화 복구 계획 §8-4 — 받은 기기 자신은 제외. 그 기기는 이 푸시를 무시(iOS 승자 분기·Android
   * isAnsweredOnThisDevice)하는데, iOS 는 VoIP 를 CallKit 보고 없이 완료하게 되어 규칙 위반이 쌓이고
   * 결국 iOS 가 앱의 VoIP 를 폐기한다(2026-10-22 `dropped on the floor`). 다른 기기는 기존대로 벨 종료.
   */
  const answeredDeviceId = input.answeredDeviceId?.trim() || null;
  await dispatchPushForUser(out, {
    event_type: "call_answered_elsewhere",
    target_type: "call_session",
    target_id: sessionId,
    call_push_kind: "call_answered_elsewhere",
    skip_settings_gate: true,
    ...(answeredDeviceId ? { exclude_device_ids: [answeredDeviceId] } : {}),
  });
}
