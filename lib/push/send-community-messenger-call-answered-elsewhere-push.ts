/**
 * Callee multi-device: after first accept, dismiss ringing UI on other devices.
 * @see docs/dibay-call-multi-device-policy.md
 */

import { getSiteOrigin } from "@/lib/env/runtime";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import { translate } from "@/lib/i18n/messages";
import {
  CALL_PUSH_DEFAULT_ALERT_LANGUAGE,
  buildLocalizedPushAlert,
} from "@/lib/push/dispatch/localized-push-alert";

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
  const answeredDeviceId = String(input.answeredDeviceId ?? "").trim();

  const link_url = `/community-messenger/calls/${encodeURIComponent(sessionId)}`;
  /**
   * 제목 = 받는 기기의 앱 언어(ko 「통화」 그대로). 기기는 종류 값(`call_push_kind`)만 보고 닫는다 — 글자는 표시용.
   * ko·en 두 벌을 넘기고 발송부가 대상 조회에서 이미 읽은 기기 언어로 고른다(언어 조회·대기 없음, 모르면 변경 전 한국어 글자).
   */
  const localizedAlert = buildLocalizedPushAlert((lang) => ({ title: translate(lang, "cm_ui_call_label"), body: "" }));
  const out: NotificationSideEffectPayloadOut = {
    user_id: recipient,
    notification_type: "community_messenger_call_canceled",
    title: localizedAlert[CALL_PUSH_DEFAULT_ALERT_LANGUAGE]!.title,
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

  await dispatchPushForUser(out, {
    event_type: "call_answered_elsewhere",
    target_type: "call_session",
    target_id: sessionId,
    call_push_kind: "call_answered_elsewhere",
    // 받은 기기에는 iOS VoIP 를 보내지 않는다(이미 CallKit 이 그 통화를 소유).
    ...(answeredDeviceId ? { ios_voip_terminal_exclude_device_ids: [answeredDeviceId] } : {}),
    skip_settings_gate: true,
    localized_alert: localizedAlert,
  });
}
