/**
 * 1:1 통화 발신 취소 — 수신자 기존 통화 알림/CallKit 정리용 push (새 알림 없음).
 * @see docs/messenger-call-notification-policy.md
 */

import { getSiteOrigin } from "@/lib/env/runtime";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import { translate } from "@/lib/i18n/messages";
import {
  CALL_PUSH_DEFAULT_ALERT_LANGUAGE,
  buildLocalizedPushAlert,
} from "@/lib/push/dispatch/localized-push-alert";
import type { DispatchPushOptions } from "@/lib/push/dispatch/push-payload-types";

function absolutizeLink(link: string | null | undefined): string | null {
  if (link == null || !String(link).trim()) return null;
  const s = String(link).trim();
  if (/^https?:\/\//i.test(s)) return s;
  const base = getSiteOrigin();
  if (!base) return null;
  return s.startsWith("/") ? `${base}${s}` : `${base}/${s}`;
}

type CommunityMessengerCallTerminalStatus = "cancelled" | "rejected" | "ended" | "missed";

function callPushKindForTerminalStatus(
  status: CommunityMessengerCallTerminalStatus
): NonNullable<DispatchPushOptions["call_push_kind"]> {
  if (status === "rejected") return "call_rejected";
  if (status === "ended") return "call_ended";
  if (status === "missed") return "call_missed";
  return "call_canceled";
}

export async function sendWebPushForCommunityMessengerCallTerminal(input: {
  recipientUserId: string;
  sessionId: string;
  status: CommunityMessengerCallTerminalStatus;
  /** 거절한 기기(`user_devices.device_id`) — 그 기기에는 iOS VoIP 종료 신호를 보내지 않는다. */
  actorDeviceId?: string | null;
}): Promise<void> {
  const recipient = input.recipientUserId.trim();
  const sessionId = input.sessionId.trim();
  if (!recipient || !sessionId) return;
  const actorDeviceId = String(input.actorDeviceId ?? "").trim();

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
    meta: { session_id: sessionId, status: input.status },
    link_url_absolute: absolutizeLink(link_url),
    occurred_at: new Date().toISOString(),
  };

  await dispatchPushForUser(out, {
    event_type:
      input.status === "rejected"
        ? "call_reject"
        : input.status === "ended"
          ? "call_end"
          : input.status === "missed"
            ? "call_missed_terminal"
            : "call_cancel",
    target_type: "call_session",
    target_id: sessionId,
    call_push_kind: callPushKindForTerminalStatus(input.status),
    ...(actorDeviceId ? { ios_voip_terminal_exclude_device_ids: [actorDeviceId] } : {}),
    skip_settings_gate: true,
    localized_alert: localizedAlert,
  });
}

export async function sendWebPushForCommunityMessengerCallCanceled(input: {
  recipientUserId: string;
  sessionId: string;
}): Promise<void> {
  await sendWebPushForCommunityMessengerCallTerminal({ ...input, status: "cancelled" });
}
