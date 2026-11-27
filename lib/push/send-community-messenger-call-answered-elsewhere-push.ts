/**
 * Callee multi-device: after first accept, dismiss ringing UI on other devices.
 * @see docs/dibay-call-multi-device-policy.md
 */

import { getSiteOrigin } from "@/lib/env/runtime";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import { translate } from "@/lib/i18n/messages";
import {
  CALL_SIGNAL_LEGACY_COPY_LANGUAGE,
  resolveCallPushLanguageNoWait,
} from "@/lib/push/call-push-recipient-language";

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
   * 제목 = 받는 사람 언어(ko 「통화」 그대로). 기기는 종류 값(`call_push_kind`)만 보고 닫는다 — 글자는 표시용.
   * 종료 신호는 언어 조회를 기다리지 않는다: 캐시가 없으면 예전 문구(ko)로 즉시 보내고 조회는 뒤에서 캐시만 채운다.
   */
  const language = resolveCallPushLanguageNoWait(recipient) ?? CALL_SIGNAL_LEGACY_COPY_LANGUAGE;
  const out: NotificationSideEffectPayloadOut = {
    user_id: recipient,
    notification_type: "community_messenger_call_canceled",
    title: translate(language, "cm_ui_call_label"),
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
  });
}
