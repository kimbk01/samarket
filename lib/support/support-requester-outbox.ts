import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAndDispatchNotificationEvent } from "@/lib/notifications/pipeline/notification-event-dispatcher";

/**
 * 고객 알림 영구 재시도 (전체 수정 계약 §4 · 재감사 S-6).
 * 응답 전 저장이 두 번 다 실패하면 어드민 알림과 같은 재시도 대기열(`admin_notification_outbox`)에 **고객 알림 사건**을 넣는다.
 * 5분 작업자(`processAdminNotificationOutbox`)가 꺼내 다시 만든다 — 같은 dedupe 키라 중복 없음, 실패하면 대기열 규칙대로 다시(최대 8회).
 */
export const SUPPORT_REQUESTER_OUTBOX_KIND = "support_requester_notification";

export type SupportRequesterOutboxPayload = {
  kind: typeof SUPPORT_REQUESTER_OUTBOX_KIND;
  /** `createAndDispatchNotificationEvent` 에 그대로 넘기는 사건(저장할 때와 같은 값) */
  event: Record<string, unknown> & { dedupeKey: string };
  requesterUserId: string;
  /** 답변 알림이면 그 답변 id — 보내기 직전 지워졌으면 만들지 않는다 */
  replyMessageId: string | null;
};

export function isSupportRequesterOutboxPayload(payload: unknown): payload is SupportRequesterOutboxPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  const ev = p.event as Record<string, unknown> | undefined;
  return (
    p.kind === SUPPORT_REQUESTER_OUTBOX_KIND &&
    typeof p.requesterUserId === "string" &&
    !!ev &&
    typeof ev === "object" &&
    typeof ev.dedupeKey === "string"
  );
}

/** 대기열에 넣기 — 넣었으면(또는 이미 있으면) true */
export async function enqueueSupportRequesterNotification(
  sb: SupabaseClient,
  payload: Omit<SupportRequesterOutboxPayload, "kind">,
  error: string
): Promise<boolean> {
  const body: SupportRequesterOutboxPayload = { kind: SUPPORT_REQUESTER_OUTBOX_KIND, ...payload };
  const { error: qErr } = await sb.rpc("admin_notification_outbox_enqueue", {
    p_source_key: `requester:${payload.event.dedupeKey}`,
    p_kind: SUPPORT_REQUESTER_OUTBOX_KIND,
    p_payload: body as unknown as Record<string, unknown>,
    p_error: error.slice(0, 1000),
  });
  if (qErr) {
    console.error("[support] requester_outbox_enqueue_failed", { dedupeKey: payload.event.dedupeKey, error: qErr.message });
    return false;
  }
  return true;
}

/** 작업자가 꺼낸 고객 알림 1건 다시 만들기 */
export async function replaySupportRequesterNotification(
  sb: SupabaseClient,
  payload: SupportRequesterOutboxPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (payload.replyMessageId) {
    const { data: m, error } = await sb
      .from("support_messages")
      .select("deleted_at")
      .eq("id", payload.replyMessageId)
      .maybeSingle();
    if (error) return { ok: false, error: "reply_read_failed" };
    // 그사이 답변이 지워졌다 — 알림을 만들지 않고 처리됨으로 닫는다(지운 원문이 알림함에 남지 않음)
    if ((m as { deleted_at?: unknown } | null)?.deleted_at) return { ok: true };
  }
  const r = await createAndDispatchNotificationEvent(sb, payload.event as never).catch((e: unknown) => ({
    ok: false as const,
    error: (e as Error)?.message ?? "notification_failed",
  }));
  if (r.ok || (r as { duplicate?: boolean }).duplicate) return { ok: true };
  return { ok: false, error: String((r as { error?: string }).error ?? "notification_failed") };
}
