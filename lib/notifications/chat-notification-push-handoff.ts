/**
 * WP-7 / NEW-24 + NOTI-08 — 채팅·부재중 푸시의 durable handoff 복구.
 *
 * 기존 commerce handoff(SR-1 P2) 의 generic 조각(markResult/classify/dispatch)을 재사용하고,
 * 타입 집합과 claim RPC 만 채팅용으로 일반화한다. 새 테이블/큐/워커는 만들지 않는다.
 *
 * 흐름:
 *  1) 메시지 이벤트 생성 시 push_handoff_status='pending', next_at=now()+grace 로 표시.
 *  2) route after() 가 즉시 1회 dispatch → 성공이면 handed_off 로 닫는다(미claim 행만).
 *  3) after() 가 죽거나 실패해 grace(기본 90s) 후에도 pending/retryable 인 행은 1분 cron 이 복구.
 *  4) 만료: 일반 채팅은 10분(POLICY_REQUIRED, Owner 조정), 통화는 1시간 넘으면 보내지 않고 정리.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { dispatchNotificationEvent } from "@/lib/notifications/pipeline/notification-event-dispatcher";
import {
  markCommercePushHandoffResult,
  classifyCommercePushHandoffError,
  COMMERCE_PUSH_HANDOFF_MAX_ATTEMPTS,
} from "@/lib/notifications/commerce-notification-push-handoff";

/** 복구 대상 채팅/부재중 이벤트 타입(진행 중 통화 신호 incoming_call_signal 은 제외 — 재전송 금지). */
export const CHAT_PUSH_MANAGED_EVENT_TYPES = [
  "chat_message",
  "group_message",
  "mention_message",
  "pin_message",
  "trade_message",
  "store_order_message",
  "missed_call",
] as const;

/** fast-path(after()) 가 못 보낸 푸시를 cron 이 주워가기 전까지의 유예(초과분만 복구). */
const CHAT_PUSH_HANDOFF_FASTPATH_GRACE_MS = 90_000;

/**
 * NOTI-08 POLICY_REQUIRED — 생성 후 이 시간이 지난 일반 채팅 푸시는 보내지 않는다.
 * 설계 제안값 10분. Owner 가 조정할 수 있는 정책값이다(코드 상수는 기본값일 뿐).
 */
export const CHAT_PUSH_HANDOFF_EXPIRY_MS = 10 * 60_000;

/** 통화 푸시의 오래된 pending 은 1시간 뒤 실패 처리(재전송 없음). */
const CHAT_PUSH_CALL_STALE_FAIL_MS = 60 * 60_000;

const CHAT_CALL_TYPES = new Set<string>(["missed_call", "incoming_call_signal"]);

export function isChatPushManagedEventType(type: string): boolean {
  return (CHAT_PUSH_MANAGED_EVENT_TYPES as readonly string[]).includes(type);
}

/** 이벤트 생성 직후: durable 복구 대상으로 표시(grace 뒤 cron 이 복구 가능). */
export async function markChatPushHandoffPending(
  sb: SupabaseClient,
  eventId: string
): Promise<boolean> {
  const id = eventId.trim();
  if (!id) return false;
  const nextAt = new Date(Date.now() + CHAT_PUSH_HANDOFF_FASTPATH_GRACE_MS).toISOString();
  const { error } = await sb
    .from("notification_events")
    .update({
      push_handoff_status: "pending",
      push_handoff_next_at: nextAt,
      push_handoff_claimed_at: null,
      push_handoff_claim_token: null,
      push_handoff_last_error: null,
    })
    .eq("id", id)
    .in("type", CHAT_PUSH_MANAGED_EVENT_TYPES as unknown as string[]);
  if (error) {
    console.error("[markChatPushHandoffPending]", error.message);
    return false;
  }
  return true;
}

/** fast-path(after()) 전송 성공 → 아직 claim 안 된 pending 행만 handed_off 로 닫는다. */
export async function markChatPushHandoffFastPathSent(
  sb: SupabaseClient,
  eventId: string
): Promise<void> {
  const id = eventId.trim();
  if (!id) return;
  await sb
    .from("notification_events")
    .update({
      push_handoff_status: "handed_off",
      push_handoff_next_at: null,
      push_handoff_claimed_at: null,
      push_handoff_claim_token: null,
      push_handoff_last_error: null,
    })
    .eq("id", id)
    .eq("push_handoff_status", "pending")
    .is("push_handoff_claim_token", null);
}

export async function claimChatPushHandoffEvents(
  sb: SupabaseClient,
  opts?: { limit?: number; claimToken?: string }
): Promise<NotificationEventRow[]> {
  const claimToken =
    opts?.claimToken?.trim() ||
    `cph2_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const limit = Math.max(1, Math.min(100, Math.floor(opts?.limit ?? 20)));
  const { data, error } = await sb.rpc("claim_notification_push_handoff", {
    p_types: CHAT_PUSH_MANAGED_EVENT_TYPES as unknown as string[],
    p_limit: limit,
    p_claim_token: claimToken,
    p_stale_claim_seconds: 120,
  });
  if (error) {
    console.error("[claimChatPushHandoffEvents]", error.message);
    return [];
  }
  const rows = Array.isArray(data) ? (data as NotificationEventRow[]) : [];
  for (const row of rows) {
    (row as NotificationEventRow & { _claimToken?: string })._claimToken = claimToken;
  }
  return rows;
}

export async function processClaimedChatPushHandoff(
  sb: SupabaseClient,
  row: NotificationEventRow & { _claimToken?: string }
): Promise<"handed_off" | "retryable" | "terminal" | "expired"> {
  const claimToken = String(row._claimToken ?? row.push_handoff_claim_token ?? "").trim();
  const attempts = Math.max(1, Math.floor(Number(row.push_handoff_attempts) || 1));
  if (!claimToken) return "terminal";

  // 만료: 통화 1h, 일반 채팅 10분(POLICY) 초과면 보내지 않고 정리(terminal).
  const createdMs = Date.parse(String(row.created_at ?? "")) || 0;
  const ageMs = createdMs > 0 ? Date.now() - createdMs : 0;
  const isCall = CHAT_CALL_TYPES.has(String(row.type));
  const expiryMs = isCall ? CHAT_PUSH_CALL_STALE_FAIL_MS : CHAT_PUSH_HANDOFF_EXPIRY_MS;
  if (ageMs > expiryMs) {
    await markCommercePushHandoffResult(sb, {
      eventId: row.id,
      claimToken,
      ok: false,
      attempts,
      error: isCall ? "call_push_stale_1h" : "chat_push_expired_10m",
      permanent: true,
    });
    return "expired";
  }

  try {
    // dispatchNotificationEvent 는 presence/정책상 이미 활성(읽는 중)이면 noop(미발송) 을 돌려준다.
    const outcome = await dispatchNotificationEvent(sb, row, { appState: "background" });
    if (outcome === "permanent") {
      await markCommercePushHandoffResult(sb, {
        eventId: row.id,
        claimToken,
        ok: false,
        attempts,
        error: "push_permanent_failure",
        permanent: true,
      });
      return "terminal";
    }
    if (outcome === "retryable") {
      await markCommercePushHandoffResult(sb, {
        eventId: row.id,
        claimToken,
        ok: false,
        attempts,
        error: "push_retryable_failure",
        permanent: false,
      });
      return attempts >= COMMERCE_PUSH_HANDOFF_MAX_ATTEMPTS ? "terminal" : "retryable";
    }
    // sent | noop(대상 없음/정책 skip·이미 읽음) → handoff 완료.
    await markCommercePushHandoffResult(sb, { eventId: row.id, claimToken, ok: true, attempts });
    return "handed_off";
  } catch (err) {
    const classified = classifyCommercePushHandoffError(err);
    await markCommercePushHandoffResult(sb, {
      eventId: row.id,
      claimToken,
      ok: false,
      attempts,
      error: classified.message,
      permanent: classified.permanent,
    });
    return classified.permanent || attempts >= COMMERCE_PUSH_HANDOFF_MAX_ATTEMPTS
      ? "terminal"
      : "retryable";
  }
}
