/**
 * 커뮤니티 메신저 1:1 수신 통화 — 탭이 닫혀 있어도 Web Push 로 알림.
 * `public/sw.js` 가 `sessionId`·`url` 로 통화 화면으로 연결한다.
 */

import { getSiteOrigin } from "@/lib/env/runtime";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { DEFAULT_INCOMING_RING_TIMEOUT_SECONDS } from "@/lib/community-messenger/messenger-call-ring-timeout";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import type { RoomDomainEnvelope } from "@/lib/chat-domain/room-domain-envelope";
import { domainEnvelopeToPushMeta } from "@/lib/chat-domain/room-domain-envelope";

const INCOMING_CALL_FCM_TTL_MS = 60_000;
const INCOMING_CALL_SERVER_EXPIRES_SECONDS = 90;

function absolutizeLink(link: string | null | undefined): string | null {
  if (link == null || !String(link).trim()) return null;
  const s = String(link).trim();
  if (/^https?:\/\//i.test(s)) return s;
  const base = getSiteOrigin();
  if (!base) return null;
  return s.startsWith("/") ? `${base}${s}` : `${base}/${s}`;
}

function computeExpiresAtIso(startedAt: string): string {
  const startMs = new Date(startedAt).getTime();
  const baseMs = Number.isFinite(startMs) ? startMs : Date.now();
  return new Date(baseMs + INCOMING_CALL_SERVER_EXPIRES_SECONDS * 1000).toISOString();
}

export async function sendWebPushForCommunityMessengerIncomingCall(input: {
  recipientUserId: string;
  sessionId: string;
  roomId: string;
  callerId: string;
  callKind: CommunityMessengerCallKind;
  callerDisplayName: string;
  callerAvatar?: string | null;
  startedAt: string;
  /** Immutable domain snapshot — required for four-domain deep link. */
  domainEnvelope?: RoomDomainEnvelope | null;
}): Promise<void> {
  const recipient = input.recipientUserId.trim();
  const sessionId = input.sessionId.trim();
  const roomId = input.roomId.trim();
  const callerId = input.callerId.trim();
  const startedAt = input.startedAt.trim();
  if (!recipient || !sessionId || !roomId || !callerId) return;

  const link_url = `/community-messenger/calls/${encodeURIComponent(sessionId)}`;
  const isVideo = input.callKind === "video";
  const callerAvatarRaw = input.callerAvatar?.trim() || null;
  const callerAvatar = absolutizeLink(callerAvatarRaw);
  const expiresAt = computeExpiresAtIso(startedAt || new Date().toISOString());
  const domainMeta =
    input.domainEnvelope && input.domainEnvelope.roomId === roomId
      ? domainEnvelopeToPushMeta(input.domainEnvelope)
      : {};

  const out: NotificationSideEffectPayloadOut = {
    user_id: recipient,
    notification_type: "community_messenger_incoming_call",
    title: isVideo ? "영상 통화" : "음성 통화",
    body: `${input.callerDisplayName}님의 전화`,
    link_url,
    meta: {
      session_id: sessionId,
      room_id: roomId,
      caller_id: callerId,
      caller_name: input.callerDisplayName,
      ...(callerAvatar ? { caller_avatar: callerAvatar } : {}),
      kind: input.callKind,
      call_kind: input.callKind,
      media_type: input.callKind === "video" ? "video" : "audio",
      started_at: startedAt || new Date().toISOString(),
      expires_at: expiresAt,
      ttl_ms: INCOMING_CALL_FCM_TTL_MS,
      ring_timeout_seconds: DEFAULT_INCOMING_RING_TIMEOUT_SECONDS,
      ...domainMeta,
    },
    link_url_absolute: absolutizeLink(link_url),
    occurred_at: new Date().toISOString(),
  };

  await dispatchPushForUser(out, {
    event_type: "call_ringing",
    target_type: "call_session",
    target_id: sessionId,
    call_push_kind: "incoming_call",
    skip_settings_gate: true,
  });
}
