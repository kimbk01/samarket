/**
 * SR-1 P2 — commerce push handoff state on notification_events.
 * Provider/device display is NOT guaranteed; handoff accept is.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { dispatchNotificationEvent } from "@/lib/notifications/pipeline/notification-event-dispatcher";

export const COMMERCE_PUSH_HANDOFF_MAX_ATTEMPTS = 8;

export type CommercePushHandoffStatus = "pending" | "retryable" | "terminal" | "handed_off";

export function isCommercePushManagedEventType(type: string): boolean {
  return type === "order_status" || type === "delivery_status";
}

export function commercePushHandoffBackoffMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  const minutes = Math.min(60, Math.pow(2, Math.min(n, 6)));
  return minutes * 60_000;
}

export async function markCommercePushHandoffPending(
  sb: SupabaseClient,
  eventId: string
): Promise<boolean> {
  const id = eventId.trim();
  if (!id) return false;
  const { error } = await sb
    .from("notification_events")
    .update({
      push_handoff_status: "pending",
      push_handoff_next_at: new Date().toISOString(),
      push_handoff_claimed_at: null,
      push_handoff_claim_token: null,
      push_handoff_last_error: null,
    })
    .eq("id", id)
    .in("type", ["order_status", "delivery_status"]);
  if (error) {
    console.error("[markCommercePushHandoffPending]", error.message);
    return false;
  }
  return true;
}

/**
 * B-01: 저장 직후 1회 즉시 발송용 — 방금 pending 으로 표시한 그 행만 claim 한다.
 * 크론 claim RPC 와 같은 토큰 열을 쓰므로, 여기서 claim 하면 크론은 stale(120초) 전까지 건너뛰고
 * 실패 시 markCommercePushHandoffResult 가 retryable 로 되돌려 크론이 복구한다.
 */
export async function claimCommercePushHandoffEventById(
  sb: SupabaseClient,
  eventId: string
): Promise<(NotificationEventRow & { _claimToken?: string }) | null> {
  const id = eventId.trim();
  if (!id) return null;
  const claimToken = `inline:${id}:${Date.now()}`;
  const { data, error } = await sb
    .from("notification_events")
    .update({
      push_handoff_claimed_at: new Date().toISOString(),
      push_handoff_claim_token: claimToken,
      push_handoff_attempts: 1,
    })
    .eq("id", id)
    .eq("push_handoff_status", "pending")
    .is("push_handoff_claimed_at", null)
    .is("push_handoff_claim_token", null)
    .in("type", ["order_status", "delivery_status"])
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[claimCommercePushHandoffEventById]", error.message);
    return null;
  }
  if (!data) return null;
  const row = data as NotificationEventRow & { _claimToken?: string };
  row._claimToken = claimToken;
  return row;
}

export async function markCommercePushHandoffResult(
  sb: SupabaseClient,
  input: {
    eventId: string;
    claimToken: string;
    ok: boolean;
    attempts: number;
    error?: string | null;
    permanent?: boolean;
  }
): Promise<void> {
  const id = input.eventId.trim();
  const token = input.claimToken.trim();
  if (!id || !token) return;

  if (input.ok) {
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
      .eq("push_handoff_claim_token", token);
    return;
  }

  const attempts = Math.max(1, Math.floor(input.attempts));
  const permanent = input.permanent === true || attempts >= COMMERCE_PUSH_HANDOFF_MAX_ATTEMPTS;
  if (permanent) {
    await sb
      .from("notification_events")
      .update({
        push_handoff_status: "terminal",
        push_handoff_next_at: null,
        push_handoff_claimed_at: null,
        push_handoff_claim_token: null,
        push_handoff_last_error: String(input.error ?? "terminal_failure").slice(0, 500),
      })
      .eq("id", id)
      .eq("push_handoff_claim_token", token);
    return;
  }

  const nextAt = new Date(Date.now() + commercePushHandoffBackoffMs(attempts)).toISOString();
  await sb
    .from("notification_events")
    .update({
      push_handoff_status: "retryable",
      push_handoff_next_at: nextAt,
      push_handoff_claimed_at: null,
      push_handoff_claim_token: null,
      push_handoff_last_error: String(input.error ?? "retryable_failure").slice(0, 500),
    })
    .eq("id", id)
    .eq("push_handoff_claim_token", token);
}

export async function claimCommercePushHandoffEvents(
  sb: SupabaseClient,
  opts?: { limit?: number; claimToken?: string }
): Promise<NotificationEventRow[]> {
  const claimToken =
    opts?.claimToken?.trim() ||
    `cph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const limit = Math.max(1, Math.min(100, Math.floor(opts?.limit ?? 20)));
  const { data, error } = await sb.rpc("claim_commerce_notification_push_handoff", {
    p_limit: limit,
    p_claim_token: claimToken,
    p_stale_claim_seconds: 120,
  });
  if (error) {
    console.error("[claimCommercePushHandoffEvents]", error.message);
    return [];
  }
  const rows = Array.isArray(data) ? (data as NotificationEventRow[]) : [];
  for (const row of rows) {
    (row as NotificationEventRow & { _claimToken?: string })._claimToken = claimToken;
  }
  return rows;
}

export function classifyCommercePushHandoffError(err: unknown): {
  permanent: boolean;
  message: string;
} {
  const message = err instanceof Error ? err.message : String(err ?? "unknown_error");
  const lower = message.toLowerCase();
  if (
    /invalid.?token|not.?registered|unregistered|gone|forbidden|401|403|404/.test(lower) ||
    /permanent|do.?not.?retry/.test(lower)
  ) {
    return { permanent: true, message };
  }
  return { permanent: false, message };
}

export async function processClaimedCommercePushHandoff(
  sb: SupabaseClient,
  row: NotificationEventRow & { _claimToken?: string }
): Promise<"handed_off" | "retryable" | "terminal"> {
  const claimToken = String(row._claimToken ?? row.push_handoff_claim_token ?? "").trim();
  const attempts = Math.max(1, Math.floor(Number(row.push_handoff_attempts) || 1));
  if (!claimToken) return "terminal";

  try {
    // NOTI-05: dispatch 가 항상 성공처럼 보이던 문제 수정 — 실제 전달 결과로 handoff 상태를 정합한다.
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
    // sent | noop(대상 없음/정책 skip) → handoff 는 완료 처리
    await markCommercePushHandoffResult(sb, {
      eventId: row.id,
      claimToken,
      ok: true,
      attempts,
    });
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
