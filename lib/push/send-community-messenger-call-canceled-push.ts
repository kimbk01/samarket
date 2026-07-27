/**
 * 1:1 통화 발신 취소 — 수신자 기존 통화 알림/CallKit 정리용 push (새 알림 없음).
 * @see docs/messenger-call-notification-policy.md
 */

import { getSiteOrigin } from "@/lib/env/runtime";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import type { DispatchPushOptions } from "@/lib/push/dispatch/push-payload-types";

function absolutizeLink(link: string | null | undefined): string | null {
  if (link == null || !String(link).trim()) return null;
  const s = String(link).trim();
  if (/^https?:\/\//i.test(s)) return s;
  const base = getSiteOrigin();
  if (!base) return null;
  return s.startsWith("/") ? `${base}${s}` : `${base}/${s}`;
}

type CommunityMessengerCallTerminalStatus = "cancelled" | "rejected" | "ended";

function callPushKindForTerminalStatus(
  status: CommunityMessengerCallTerminalStatus
): NonNullable<DispatchPushOptions["call_push_kind"]> {
  if (status === "rejected") return "call_rejected";
  if (status === "ended") return "call_ended";
  return "call_canceled";
}

export async function sendWebPushForCommunityMessengerCallTerminal(input: {
  recipientUserId: string;
  sessionId: string;
  status: CommunityMessengerCallTerminalStatus;
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
      status: input.status,
      occurred_at: new Date().toISOString(),
    },
    link_url_absolute: absolutizeLink(link_url),
    occurred_at: new Date().toISOString(),
  };

  await dispatchPushForUser(out, {
    event_type:
      input.status === "rejected" ? "call_reject" : input.status === "ended" ? "call_end" : "call_cancel",
    target_type: "call_session",
    target_id: sessionId,
    call_push_kind: callPushKindForTerminalStatus(input.status),
    skip_settings_gate: true,
  });
}

export async function sendWebPushForCommunityMessengerCallCanceled(input: {
  recipientUserId: string;
  sessionId: string;
}): Promise<void> {
  await sendWebPushForCommunityMessengerCallTerminal({ ...input, status: "cancelled" });
}
