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
import { translate } from "@/lib/i18n/messages";
import {
  CALL_PUSH_DEFAULT_ALERT_LANGUAGE,
  buildLocalizedPushAlert,
} from "@/lib/push/dispatch/localized-push-alert";

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
  /** 대기 통화(받는 사람이 다른 통화에 연결된 중) — 기기가 「거절 / 종료 후 받기」로 표시 (WS1). */
  waiting?: boolean;
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

  /**
   * 제목·본문 = 받는 기기의 앱 언어 (docs/audit/i18n-postmerge-fix-design-2026-11-27.md §3 C2).
   * ko·en 두 벌을 넘기고 발송부가 대상 조회에서 이미 읽은 `user_devices.app_language` 로 기기마다 고른다 —
   * 언어 조회·대기 없음. 기기 언어를 모르면 아래 `out` 글자 = 변경 전 한국어 글자.
   * ko 는 예전 글자 그대로(「영상 통화/음성 통화」「{이름}님의 전화」). 네이티브 수신 화면 이름은 아래 `caller_name`
   * 데이터를 먼저 읽는다(설치된 구 빌드 포함) — 이 데이터 키·값은 바꾸지 않는다.
   */
  const localizedAlert = buildLocalizedPushAlert((lang) => ({
    title: translate(lang, isVideo ? "nav_video_call_label" : "nav_voice_call_label"),
    body: translate(lang, "reaudit_call_incoming_push_body", { name: input.callerDisplayName }),
  }));
  const defaultAlert = localizedAlert[CALL_PUSH_DEFAULT_ALERT_LANGUAGE]!;
  const out: NotificationSideEffectPayloadOut = {
    user_id: recipient,
    notification_type: "community_messenger_incoming_call",
    title: defaultAlert.title,
    body: defaultAlert.body,
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
      ...(input.waiting === true ? { waiting: true } : {}),
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
    localized_alert: localizedAlert,
  });

  console.info("[incoming_call_push_dispatch]", {
    callId: sessionId,
    roomId,
    callerUserIdHash: callerId.slice(0, 8),
    recipientUserIdHash: recipient.slice(0, 8),
    pushKind: "incoming_call",
    mediaType: input.callKind,
    sentAt: out.occurred_at,
  });
}
