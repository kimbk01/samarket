/**
 * CUT 5 — Room-bound missed product notification SSOT
 *
 * Chain:
 *   CUT2 missed terminal → CUT3 missed_timeout → CUT4 call_stub (Conversation B unread)
 *   → ONE logical notification_events.missed_call (callee)
 *   → push deliveries (N devices)
 *   → tap → exact /community-messenger/rooms/{session.room_id}
 *
 * NOT confused with:
 *   incoming_call (ringing transport)
 *   orphan missed_call (room_id null → Bell A / App Icon orphan)
 *   call_canceled / call_rejected / call_ended (terminal dismiss — CUT7)
 *
 * Bell digit: room-bound missed_call is excluded from NotificationAttention
 * (`isRoomBoundMissedCallEvent`). Do not invent a second unread writer.
 */

import { buildCanonicalNotificationRoomHref } from "@/lib/chat-domain/push/canonical-notification-room-route";
import type { CreateNotificationEventInput } from "@/lib/notifications/core/notification-event-schema";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Logical event identity — one per call session + callee (multi-device deliveries share this). */
export function resolveMissedCallNotificationDedupeKey(
  callSessionId: string,
  recipientUserId: string,
): string {
  return `missed_call:${trimText(callSessionId)}:${trimText(recipientUserId)}`;
}

/**
 * CUT5 product deeplink — exact room only.
 * No /community-messenger/calls/{sessionId}, no call-history focus query.
 */
export function buildExactMissedCallRoomHref(input: {
  roomId: string;
  chatDomain?: string | null;
}): string {
  const href = buildCanonicalNotificationRoomHref({
    roomId: input.roomId,
    chatDomain: input.chatDomain ?? "general_direct",
  });
  return href ?? `/community-messenger/rooms/${encodeURIComponent(trimText(input.roomId))}`;
}

export type RoomBoundMissedCallNotifyDecision =
  | {
      notify: true;
      recipientUserId: string;
      roomId: string;
      callSessionId: string;
      actorUserId: string;
      callKind: "voice" | "video";
    }
  | { notify: false; skipReason: string };

/** 발신자가 응답 전에 취소한 1:1 통화 — 수신자에게는 부재중 (Owner 2026-11-13 · 레거시 텔레그램 동일). */
export function isCallerCancelledBeforeAnswer(input: {
  status: string | null | undefined;
  endedReason?: string | null;
}): boolean {
  const status = trimText(input.status).toLowerCase();
  const endedReason = trimText(input.endedReason).toLowerCase();
  return status === "cancelled" && (endedReason === "canceled" || endedReason === "cancelled");
}

/** 수신자 부재중 알림 판정 대상 상태 — 받지 않음(시간 초과) 또는 발신자 취소. 호출부 게이트도 이 함수만 쓴다. */
export function isRoomBoundMissedCallCandidate(input: {
  status: string | null | undefined;
  endedReason?: string | null;
}): boolean {
  const status = trimText(input.status).toLowerCase();
  return status === "missed" || status === "timeout" || isCallerCancelledBeforeAnswer(input);
}

/**
 * When to create the logical missed product notification (room-bound).
 * Callee only. Requires session.room_id. No orphan invent path.
 * 대상: 받지 않음(missed/timeout) + 발신자 응답 전 취소(cancelled + canceled) —
 * docs/audit/call-cancel-callee-missed-design-2026-11-13.md D3.
 */
export function decideRoomBoundMissedCallNotification(input: {
  status: string | null | undefined;
  endedReason?: string | null;
  sessionMode?: string | null;
  roomId?: string | null;
  callSessionId?: string | null;
  initiatorUserId?: string | null;
  recipientUserId?: string | null;
  callKind?: string | null;
}): RoomBoundMissedCallNotifyDecision {
  const status = trimText(input.status).toLowerCase();
  const callerCancelled = isCallerCancelledBeforeAnswer(input);
  if (!isRoomBoundMissedCallCandidate(input)) {
    return { notify: false, skipReason: `status_${status || "empty"}` };
  }

  const roomId = trimText(input.roomId);
  const callSessionId = trimText(input.callSessionId);
  const recipientUserId = trimText(input.recipientUserId);
  const initiatorUserId = trimText(input.initiatorUserId);
  if (!roomId) return { notify: false, skipReason: "no_room_id" };
  if (!callSessionId) return { notify: false, skipReason: "no_session_id" };
  if (!recipientUserId) return { notify: false, skipReason: "no_callee" };

  const mode = trimText(input.sessionMode) || "direct";
  if (mode !== "direct") {
    return { notify: false, skipReason: "not_direct" };
  }

  const endedReason = trimText(input.endedReason);
  if (
    endedReason === "incoming_policy_superseded" ||
    endedReason === "answered_elsewhere" ||
    endedReason === "peer_busy" ||
    endedReason === "callee_busy" ||
    (!callerCancelled && (endedReason === "canceled" || endedReason === "cancelled")) ||
    endedReason === "declined" ||
    endedReason === "redial_replaced"
  ) {
    return { notify: false, skipReason: `ended_reason_${endedReason}` };
  }

  // status=missed → CUT3 missed_timeout; room-bound product notification (not orphan Bell gate).
  const kindRaw = trimText(input.callKind).toLowerCase();
  const callKind: "voice" | "video" = kindRaw === "video" ? "video" : "voice";

  return {
    notify: true,
    recipientUserId,
    roomId,
    callSessionId,
    actorUserId: initiatorUserId || recipientUserId,
    callKind,
  };
}

export function buildRoomBoundMissedCallNotificationInput(input: {
  recipientUserId: string;
  roomId: string;
  callSessionId: string;
  actorUserId: string;
  callKind: "voice" | "video";
  callerDisplayName?: string | null;
  chatDomain?: string | null;
  /** NOTI-01: 세션의 정규 domain_identity_key("<domain>:..."). 없으면 둘 다 null 로 둔다. */
  domainIdentityKey?: string | null;
}): CreateNotificationEventInput {
  const href = buildExactMissedCallRoomHref({
    roomId: input.roomId,
    chatDomain: input.chatDomain,
  });
  const kindLabel = input.callKind === "video" ? "영상 통화" : "음성 통화";
  const caller = trimText(input.callerDisplayName) || "상대방";
  // NOTI-01: notification_events_domain_identity_pair_check 는
  //   (chat_domain IS NULL AND domain_identity_key IS NULL)
  //   OR (chat_domain NOT NULL AND domain_identity_key ~~ chat_domain || ':%')
  // 를 요구한다. 과거 코드는 chat_domain='general_direct' + domain_identity_key=<raw roomId>
  // 를 넣어 제약 위반 → insert 실패 → .catch 로 삼켜져 부재중 알림이 0건이 됐다.
  // missed_call 은 message 타입이 아니므로 둘 다 null 이어도 제약을 통과한다.
  // 정규 키("<domain>:...")가 있을 때만 쌍으로 설정, 아니면 둘 다 null.
  const pairDomain = trimText(input.chatDomain);
  const pairKey = trimText(input.domainIdentityKey);
  const hasValidPair = Boolean(pairDomain) && Boolean(pairKey) && pairKey.startsWith(`${pairDomain}:`);
  const chatDomainColumn = hasValidPair ? pairDomain : null;
  const domainIdentityKeyColumn = hasValidPair ? pairKey : null;
  return {
    userId: input.recipientUserId,
    type: "missed_call",
    category: "missed_call",
    roomId: input.roomId,
    callSessionId: input.callSessionId,
    actorUserId: input.actorUserId,
    title: "부재중 전화",
    body: `${caller} · 부재중 ${kindLabel}`,
    unread: true,
    dedupeKey: resolveMissedCallNotificationDedupeKey(input.callSessionId, input.recipientUserId),
    displayPayload: {
      kind: "missed_call",
      callKind: input.callKind,
      routeUrl: href,
      room_id: input.roomId,
      roomId: input.roomId,
      session_id: input.callSessionId,
      sessionId: input.callSessionId,
      caller_id: input.actorUserId,
      callerId: input.actorUserId,
      caller_name: caller,
      callerName: caller,
      chatDomain: input.chatDomain ?? "general_direct",
    },
    chatDomain: chatDomainColumn,
    domainIdentityKey: domainIdentityKeyColumn,
  };
}

/** Negative: client-supplied roomId must never override session room. */
export function resolveMissedNotificationRoomId(input: {
  sessionRoomId: string | null | undefined;
  clientSuppliedRoomId?: string | null;
}): string | null {
  const sessionRoom = trimText(input.sessionRoomId);
  if (!sessionRoom) return null;
  void input.clientSuppliedRoomId;
  return sessionRoom;
}
